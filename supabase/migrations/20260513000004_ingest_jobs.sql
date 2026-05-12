-- =============================================================================
-- Ingest Jobs
--
-- Tracks every custodian CSV upload: who uploaded it, which custodian,
-- how many rows were processed, and any errors encountered.
-- Used for the dashboard upload history and debugging failed imports.
-- =============================================================================

create table if not exists public.ingest_jobs (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  tenant_id        uuid        references public.tenants (id) on delete set null,

  custodian        text        not null,   -- 'schwab', 'fidelity', 'csv_generic'
  data_type        text        not null    -- 'holdings', 'transactions'
    check (data_type in ('holdings', 'transactions')),

  file_name        text,
  status           text        not null default 'done'
    check (status in ('done', 'partial', 'failed')),

  holdings_upserted integer    not null default 0,
  tx_inserted       integer    not null default 0,
  skipped           integer    not null default 0,
  errors            jsonb      not null default '[]',

  created_at       timestamptz not null default now()
);

create index if not exists ingest_jobs_user_id_idx   on public.ingest_jobs (user_id, created_at desc);
create index if not exists ingest_jobs_tenant_id_idx on public.ingest_jobs (tenant_id, created_at desc);

alter table public.ingest_jobs enable row level security;

create policy "Users read own ingest jobs"
  on public.ingest_jobs for select
  using (auth.uid() = user_id);
