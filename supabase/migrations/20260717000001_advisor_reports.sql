-- =============================================================================
-- Advisor reports: persisted diagnostic records.
--
-- Design:
--   - Full diagnostic JSON stored as JSONB (the report renderer consumes it
--     unchanged — one visual source of truth for live and saved reports).
--   - Hot list-view fields (grade, opportunity cost, client label) are
--     denormalized into columns so the reports list never parses JSONB.
--   - INSERT is service-role only (the POST /api/advisor/reports route),
--     because inserts must pass the firm's monthly quota check — a browser
--     with RLS insert rights could bypass billing.
--   - SELECT/DELETE are RLS-direct for the owning firm; admin observer
--     gets SELECT-only, consistent with the admin role contract.
-- =============================================================================

create table if not exists public.advisor_reports (
  id            uuid        primary key default gen_random_uuid(),
  firm_id       uuid        not null references public.advisor_firms(id) on delete cascade,

  client_label  text        not null,
  broker        text,
  currency      text        not null default 'USD',

  -- Denormalized list-view fields
  overall_grade     text,
  composite_score   numeric,
  opportunity_cost  numeric,
  transaction_count integer,
  period_start      date,
  period_end        date,

  -- The complete B2BDiagnosticOutput payload
  diagnostic    jsonb       not null,

  created_at    timestamptz not null default now()
);

create index if not exists advisor_reports_firm_idx
  on public.advisor_reports (firm_id, created_at desc);

alter table public.advisor_reports enable row level security;

-- Owning firm: read + delete. No INSERT/UPDATE policies → service-role only.
create policy "advisor_reports: own firm read"
  on public.advisor_reports for select
  using (
    firm_id in (select id from public.advisor_firms where user_id = auth.uid())
    and public.is_advisor()
  );

create policy "advisor_reports: own firm delete"
  on public.advisor_reports for delete
  using (
    firm_id in (select id from public.advisor_firms where user_id = auth.uid())
    and public.is_advisor()
  );

-- Admin observer: SELECT only (read-only contract).
create policy "advisor_reports: admin observer read"
  on public.advisor_reports for select
  using (public.is_admin());
