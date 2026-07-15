-- =============================================================================
-- Advisor Auth: multi-tenant B2B identity layer
--
-- Security model:
--   app_metadata.role = 'advisor' is ONLY set by the service-role key (server).
--   Users cannot write app_metadata — only user_metadata. This means no client
--   can escalate themselves to advisor role by crafting a JWT payload.
--
--   public.is_advisor() reads the JWT's app_metadata at query time, so even if
--   middleware is somehow bypassed, RLS prevents any data access.
--
-- NOTE: Function lives in public schema — the auth schema is managed exclusively
-- by Supabase internals and is not writable by migration runners.
-- =============================================================================


-- ── public.is_advisor() ───────────────────────────────────────────────────────
-- Returns true only if the calling user's JWT contains app_metadata.role = 'advisor'.
-- SECURITY DEFINER runs as the function owner, not the calling user, so it can
-- safely read auth.jwt() regardless of the caller's privileges.
-- Grant execute to authenticated so RLS policies can call it.
create or replace function public.is_advisor()
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'advisor',
    false
  )
$$;

grant execute on function public.is_advisor() to authenticated, anon;


-- ── advisor_firms ─────────────────────────────────────────────────────────────
-- One row per registered RIA/advisor firm. Linked 1:1 to a Supabase auth user.
create table if not exists public.advisor_firms (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null unique references auth.users(id) on delete cascade,
  email                 text        not null,
  firm_name             text        not null
                                    check (char_length(trim(firm_name)) >= 2
                                       and char_length(firm_name) <= 200),

  -- Onboarding profile (collected in the 4-step signup wizard)
  firm_type             text,       -- ria | bd | family_office | mfo | independent | other
  aum_range             text,       -- under_50m | 50m_250m | 250m_1b | over_1b
  team_size             text,       -- solo | 2_5 | 6_20 | over_20
  contact_first_name    text,
  contact_last_name     text,
  job_title             text,
  primary_use_case      text,       -- prospect_presentations | client_reviews | retention_analysis | compliance_reporting | other
  onboarding_completed_at timestamptz,

  -- Branding & billing
  logo_url              text,
  plan_tier             text        not null default 'free'
                                    check (plan_tier in ('free', 'starter', 'pro', 'enterprise')),
  reports_this_month    integer     not null default 0 check (reports_this_month >= 0),
  report_limit_monthly  integer     not null default 5  check (report_limit_monthly >= 0),
  stripe_customer_id    text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists advisor_firms_user_id_idx on public.advisor_firms (user_id);

alter table public.advisor_firms enable row level security;

-- Only the advisor themselves can read their own row, and only if public.is_advisor()
-- confirms the advisor role in their JWT (set exclusively by service-role provisioning).
create policy "advisor_firms: own row read"
  on public.advisor_firms for select
  using (user_id = auth.uid() and public.is_advisor());

-- Advisors can update non-sensitive fields (firm_name, logo_url).
-- plan_tier, stripe_customer_id, report limits are service-role only.
create policy "advisor_firms: own row update"
  on public.advisor_firms for update
  using (user_id = auth.uid() and public.is_advisor())
  with check (
    user_id = auth.uid()
    and public.is_advisor()
    -- prevent self-escalation of plan or report limits
    and plan_tier = (select plan_tier from public.advisor_firms where user_id = auth.uid())
    and report_limit_monthly = (select report_limit_monthly from public.advisor_firms where user_id = auth.uid())
  );


-- ── advisor_audit_log ─────────────────────────────────────────────────────────
-- Immutable append-only log of all advisor auth events.
-- Written exclusively by service-role (provision route, callbacks).
-- Advisors can only SELECT their own rows — never INSERT/UPDATE/DELETE.
create table if not exists public.advisor_audit_log (
  id          uuid        primary key default gen_random_uuid(),
  firm_id     uuid        references public.advisor_firms(id) on delete set null,
  event       text        not null,
  -- event vocabulary: SIGNED_UP | SIGNED_IN | SIGNED_OUT | PW_RESET_REQUESTED
  --                   PROVISION_FAILED | EMAIL_VERIFIED | PLAN_UPGRADED
  ip_address  text,
  user_agent  text,
  metadata    jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists advisor_audit_firm_id_idx  on public.advisor_audit_log (firm_id);
create index if not exists advisor_audit_created_idx  on public.advisor_audit_log (created_at desc);
create index if not exists advisor_audit_event_idx    on public.advisor_audit_log (event);

alter table public.advisor_audit_log enable row level security;

-- Read-only access for advisors (their own firm's log).
create policy "advisor_audit_log: own firm read"
  on public.advisor_audit_log for select
  using (
    firm_id in (
      select id from public.advisor_firms where user_id = auth.uid()
    )
    and public.is_advisor()
  );
-- No INSERT/UPDATE/DELETE policies → service-role only.


-- ── updated_at trigger ────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'advisor_firms_set_updated_at'
      and tgrelid = 'public.advisor_firms'::regclass
  ) then
    create trigger advisor_firms_set_updated_at
      before update on public.advisor_firms
      for each row execute function public.set_updated_at();
  end if;
end;
$$;


-- ── Monthly report counter reset (pg_cron job) ────────────────────────────────
-- Resets reports_this_month to 0 on the 1st of every month at 00:05 UTC.
-- pg_cron must be enabled: "supabase extensions enable pg_cron"
-- Commented out here — run manually after enabling pg_cron.
--
-- select cron.schedule(
--   'reset-advisor-monthly-reports',
--   '5 0 1 * *',
--   $$update public.advisor_firms set reports_this_month = 0$$
-- );
