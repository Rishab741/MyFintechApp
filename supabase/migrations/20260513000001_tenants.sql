-- =============================================================================
-- Tenant Registry — Multi-tenant B2B Infrastructure
--
-- Architecture:
--   tenants        — one row per licensee (RIA firm, hedge fund, wealthtech co.)
--   tenant_members — maps Supabase auth users → tenant (many users per tenant)
--
-- Single-user consumer accounts get a tenant auto-created on first engine call.
-- B2B licensees are provisioned by a Vestara admin via create_tenant().
--
-- Every table that holds portfolio data already has user_id for RLS.
-- The tenant layer sits above: tenant_id is used by the Python engine for
-- multi-tenant isolation and audit logging — not enforced at RLS level yet
-- (RLS still uses auth.uid() = user_id; engine enforces tenant scoping).
-- =============================================================================

-- ── TABLE: tenants ────────────────────────────────────────────────────────────
create table if not exists public.tenants (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  slug         text        not null unique,     -- url-safe identifier: 'acme-advisors'

  -- Subscription tier (controls rate limits and feature access)
  tier         text        not null default 'self_serve'
    check (tier in ('self_serve', 'starter', 'professional', 'enterprise')),

  -- API key for B2B clients (hashed SHA-256 hex — never store plaintext)
  -- NULL for self-serve consumer users (they use their Supabase JWT instead)
  api_key_hash text        unique,

  -- Quotas (NULL = unlimited / use tier defaults)
  max_portfolios   integer,
  max_api_calls_mo integer,

  -- State
  is_active    boolean     not null default true,

  -- Contact
  owner_email  text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tenants_slug_idx        on public.tenants (slug);
create index if not exists tenants_api_key_hash_idx on public.tenants (api_key_hash)
  where api_key_hash is not null;

create trigger tenants_updated_at
  before update on public.tenants
  for each row execute function private.set_updated_at();

alter table public.tenants enable row level security;

-- Only the service role (engine / edge functions) reads/writes tenants.
-- No direct user RLS — tenant data is not exposed to end users via Supabase client.


-- ── TABLE: tenant_members ─────────────────────────────────────────────────────
-- Links Supabase auth users to a tenant.
-- A user belongs to exactly one tenant (enforced by UNIQUE on user_id).
-- For self-serve, each user is the sole member of their own auto-tenant.
create table if not exists public.tenant_members (
  tenant_id  uuid  not null references public.tenants (id) on delete cascade,
  user_id    uuid  not null references auth.users (id)      on delete cascade,
  role       text  not null default 'member'
    check (role in ('owner', 'admin', 'member', 'viewer')),
  joined_at  timestamptz not null default now(),

  primary key (tenant_id, user_id),
  unique (user_id)    -- one tenant per user (change to allow multi-tenant membership later)
);

create index if not exists tenant_members_user_id_idx   on public.tenant_members (user_id);
create index if not exists tenant_members_tenant_id_idx on public.tenant_members (tenant_id);

alter table public.tenant_members enable row level security;


-- ── TABLE: tenant_usage ───────────────────────────────────────────────────────
-- Rolling monthly API call counter per tenant — used for quota enforcement.
create table if not exists public.tenant_usage (
  tenant_id    uuid     not null references public.tenants (id) on delete cascade,
  month        date     not null,   -- first day of billing month: '2026-05-01'
  api_calls    bigint   not null default 0,
  compute_runs bigint   not null default 0,
  price_syncs  bigint   not null default 0,
  updated_at   timestamptz not null default now(),

  primary key (tenant_id, month)
);

alter table public.tenant_usage enable row level security;


-- ── FUNCTION: get_or_create_tenant(user_id) ───────────────────────────────────
-- Called by the engine on first request from a Supabase JWT user.
-- Returns the tenant_id, creating a self-serve tenant if one doesn't exist yet.
create or replace function public.get_or_create_tenant(p_user_id uuid)
returns uuid
language plpgsql
security definer    -- runs as the function owner (service role context)
as $$
declare
  v_tenant_id uuid;
  v_email     text;
  v_slug      text;
begin
  -- Fast path: member already exists
  select tenant_id into v_tenant_id
  from public.tenant_members
  where user_id = p_user_id;

  if found then
    return v_tenant_id;
  end if;

  -- Slow path: create a self-serve tenant for this user
  select email into v_email
  from auth.users
  where id = p_user_id;

  -- Slug: prefix + first 8 chars of user UUID (guaranteed unique)
  v_slug := 'user-' || left(p_user_id::text, 8);

  insert into public.tenants (name, slug, tier, owner_email)
  values (
    coalesce(v_email, 'Self-Serve User'),
    v_slug,
    'self_serve',
    v_email
  )
  returning id into v_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant_id, p_user_id, 'owner');

  return v_tenant_id;
end;
$$;


-- ── BACKFILL: auto-create a tenant for every existing user ────────────────────
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
do $$
declare
  rec record;
  v_tenant_id uuid;
  v_slug      text;
begin
  for rec in
    select u.id as user_id, u.email
    from auth.users u
    where not exists (
      select 1 from public.tenant_members tm where tm.user_id = u.id
    )
  loop
    v_slug := 'user-' || left(rec.user_id::text, 8);

    -- Tenant may already exist if slug collides — skip with ON CONFLICT
    insert into public.tenants (name, slug, tier, owner_email)
    values (
      coalesce(rec.email, 'Self-Serve User'),
      v_slug,
      'self_serve',
      rec.email
    )
    on conflict (slug) do nothing
    returning id into v_tenant_id;

    -- If insert was skipped (conflict), look it up
    if v_tenant_id is null then
      select id into v_tenant_id from public.tenants where slug = v_slug;
    end if;

    insert into public.tenant_members (tenant_id, user_id, role)
    values (v_tenant_id, rec.user_id, 'owner')
    on conflict do nothing;
  end loop;
end $$;


-- ── FUNCTION: increment_tenant_usage(tenant_id, api_calls, compute, prices) ──
create or replace function public.increment_tenant_usage(
  p_tenant_id    uuid,
  p_api_calls    int default 1,
  p_compute_runs int default 0,
  p_price_syncs  int default 0
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.tenant_usage (tenant_id, month, api_calls, compute_runs, price_syncs)
  values (
    p_tenant_id,
    date_trunc('month', now())::date,
    p_api_calls,
    p_compute_runs,
    p_price_syncs
  )
  on conflict (tenant_id, month) do update set
    api_calls    = tenant_usage.api_calls    + excluded.api_calls,
    compute_runs = tenant_usage.compute_runs + excluded.compute_runs,
    price_syncs  = tenant_usage.price_syncs  + excluded.price_syncs,
    updated_at   = now();
end;
$$;
