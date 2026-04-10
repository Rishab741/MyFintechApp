-- =============================================================================
-- Phase 1 — Time-Series Tables (PostgreSQL-native, no TimescaleDB)
--
-- Two append-only tables using PostgreSQL declarative range partitioning
-- (PARTITION BY RANGE on the time column):
--
--   price_history          — OHLCV bars per asset
--   portfolio_snapshots_v2 — normalised daily NAV snapshots per user
--
-- Why range partitioning without TimescaleDB?
--   • Queries with a time-range WHERE clause only scan the relevant
--     partitions — the same benefit as TimescaleDB chunks.
--   • Old partitions can be detached and archived (cold storage) with a
--     single ALTER TABLE … DETACH PARTITION — zero downtime.
--   • Pure PostgreSQL: works on any Supabase plan.
--
-- Partition strategy: quarterly (3-month) partitions.
--   We create 2026 Q1–Q4 + a catch-all "future" partition up front.
--   The pg_cron job at the bottom creates new quarterly partitions
--   automatically 14 days before each quarter begins.
--
-- BRIN indexes on the time column give very low storage overhead for
-- sequential (append-only) writes while still accelerating range scans.
-- =============================================================================

-- =============================================================================
-- TABLE: price_history
-- Partitioned by time, 3-month chunks.
-- =============================================================================
create table if not exists public.price_history (
  time        timestamptz     not null,
  asset_id    uuid            not null references public.assets (id) on delete cascade,
  symbol      text            not null,
  currency    text            not null default 'USD',

  -- OHLCV
  open        numeric(20,8),
  high        numeric(20,8),
  low         numeric(20,8),
  close       numeric(20,8)   not null,
  volume      numeric(28,4),

  -- Data provenance
  source      text            not null default 'unknown',
  adjusted    boolean         not null default false,

  primary key (time, asset_id)
) partition by range (time);

-- ── 2026 quarterly partitions ─────────────────────────────────────────────────
create table if not exists public.price_history_2026_q1
  partition of public.price_history
  for values from ('2026-01-01') to ('2026-04-01');

create table if not exists public.price_history_2026_q2
  partition of public.price_history
  for values from ('2026-04-01') to ('2026-07-01');

create table if not exists public.price_history_2026_q3
  partition of public.price_history
  for values from ('2026-07-01') to ('2026-10-01');

create table if not exists public.price_history_2026_q4
  partition of public.price_history
  for values from ('2026-10-01') to ('2027-01-01');

-- Default partition catches anything outside defined ranges
-- (future data, backfill of pre-2026 history)
create table if not exists public.price_history_default
  partition of public.price_history default;

-- ── Indexes (created on the parent; PostgreSQL propagates to partitions) ───────
-- BRIN: excellent for sequential time writes, tiny storage footprint
create index if not exists price_history_time_brin
  on public.price_history using brin (time);

-- B-tree: point queries on (asset, time range)
create index if not exists price_history_asset_time_idx
  on public.price_history (asset_id, time desc);

create index if not exists price_history_symbol_time_idx
  on public.price_history (symbol, time desc);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.price_history enable row level security;

create policy "Authenticated users read price_history"
  on public.price_history for select
  to authenticated
  using (true);

-- =============================================================================
-- TABLE: portfolio_snapshots_v2
-- Partitioned by time, 3-month chunks.
-- Normalised replacement for the JSONB portfolio_snapshots table.
-- One row per (user, time) snapshot — the data normaliser (migration 006)
-- backfills this from existing JSONB blobs.
-- =============================================================================
create table if not exists public.portfolio_snapshots_v2 (
  time            timestamptz     not null,
  user_id         uuid            not null references auth.users (id) on delete cascade,
  account_id      uuid            references public.accounts (id) on delete cascade,

  -- NAV
  total_value     numeric(20,8)   not null,
  cash_value      numeric(20,8)   not null default 0,
  invested_value  numeric(20,8)   not null default 0,
  total_pnl       numeric(20,8),
  daily_return    numeric(10,6),           -- % vs previous snapshot

  -- Benchmark
  benchmark_value  numeric(20,8),
  benchmark_symbol text            not null default 'SPY',

  currency        text            not null default 'USD',

  primary key (time, user_id)
) partition by range (time);

-- ── 2026 quarterly partitions ─────────────────────────────────────────────────
create table if not exists public.portfolio_snapshots_v2_2026_q1
  partition of public.portfolio_snapshots_v2
  for values from ('2026-01-01') to ('2026-04-01');

create table if not exists public.portfolio_snapshots_v2_2026_q2
  partition of public.portfolio_snapshots_v2
  for values from ('2026-04-01') to ('2026-07-01');

create table if not exists public.portfolio_snapshots_v2_2026_q3
  partition of public.portfolio_snapshots_v2
  for values from ('2026-07-01') to ('2026-10-01');

create table if not exists public.portfolio_snapshots_v2_2026_q4
  partition of public.portfolio_snapshots_v2
  for values from ('2026-10-01') to ('2027-01-01');

create table if not exists public.portfolio_snapshots_v2_default
  partition of public.portfolio_snapshots_v2 default;

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists psv2_time_brin
  on public.portfolio_snapshots_v2 using brin (time);

create index if not exists psv2_user_time_idx
  on public.portfolio_snapshots_v2 (user_id, time desc);

create index if not exists psv2_account_time_idx
  on public.portfolio_snapshots_v2 (account_id, time desc)
  where account_id is not null;

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.portfolio_snapshots_v2 enable row level security;

create policy "Users read own portfolio_snapshots_v2"
  on public.portfolio_snapshots_v2 for select
  using (auth.uid() = user_id);

create policy "Users manage own portfolio_snapshots_v2"
  on public.portfolio_snapshots_v2 for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Realtime ──────────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.portfolio_snapshots_v2;

-- =============================================================================
-- FUNCTION: private.create_quarterly_partitions
-- Called by the pg_cron job below to pre-create partitions for the next
-- quarter, 14 days before it begins.  Safe to call multiple times —
-- CREATE TABLE IF NOT EXISTS is idempotent.
-- =============================================================================
create or replace function private.create_quarterly_partitions()
returns void
language plpgsql
security definer
as $$
declare
  -- Target: the quarter starting 14 days from now
  v_target_start  date := date_trunc('quarter', current_date + interval '14 days')::date;
  v_target_end    date := (v_target_start + interval '3 months')::date;
  v_suffix        text := to_char(v_target_start, 'YYYY_"q"Q');
  v_ph_name       text := 'price_history_'            || v_suffix;
  v_psv2_name     text := 'portfolio_snapshots_v2_'   || v_suffix;
begin
  -- price_history partition
  execute format(
    'create table if not exists public.%I
       partition of public.price_history
       for values from (%L) to (%L)',
    v_ph_name, v_target_start, v_target_end
  );

  -- portfolio_snapshots_v2 partition
  execute format(
    'create table if not exists public.%I
       partition of public.portfolio_snapshots_v2
       for values from (%L) to (%L)',
    v_psv2_name, v_target_start, v_target_end
  );

  raise notice 'Created partitions: % and %', v_ph_name, v_psv2_name;
end;
$$;

-- ── pg_cron: create next quarter's partitions on the 15th of the last month
--   of each quarter (Mar 15, Jun 15, Sep 15, Dec 15)
select cron.unschedule('create-quarterly-partitions')
where exists (
  select 1 from cron.job where jobname = 'create-quarterly-partitions'
);

select cron.schedule(
  'create-quarterly-partitions',
  '0 1 15 3,6,9,12 *',        -- 01:00 UTC on the 15th of quarter-end months
  $cron$
    select private.create_quarterly_partitions();
  $cron$
);

-- ── audit_logs: add time-based indexes (stays as a regular table) ─────────────
-- The audit_logs table from migration 002 is not partitioned —
-- the volume is low enough that a standard B-tree index is sufficient.
-- No changes needed; indexes were already created in migration 002.
