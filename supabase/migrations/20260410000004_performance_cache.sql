-- =============================================================================
-- Phase 1 — Performance Cache + Materialized View (PostgreSQL-native)
--
-- Without TimescaleDB there are no continuous aggregates.
-- We use two PostgreSQL-native equivalents:
--
-- 1. MATERIALIZED VIEW: daily_portfolio_values
--    Aggregates portfolio_snapshots_v2 into one row per (day, user).
--    Refreshed every hour by a pg_cron job using REFRESH CONCURRENTLY
--    so queries are never blocked during a refresh.
--
-- 2. TABLE: performance_cache
--    Pre-computed risk and return metrics written by the FastAPI
--    Portfolio Engine (Phase 2) after each sync.  The app reads this
--    table directly — no on-the-fly risk calculation at query time.
--
-- =============================================================================

-- =============================================================================
-- MATERIALIZED VIEW: daily_portfolio_values
-- One row per (calendar day, user_id) with closing portfolio NAV.
-- Used by the chart endpoints and the query_portfolio_history view.
--
-- CONCURRENTLY requires a unique index — created immediately after.
-- =============================================================================
create materialized view if not exists public.daily_portfolio_values as
select
  date_trunc('day', time)::date         as bucket,
  user_id,

  -- "Last" value in the day = the snapshot closest to market close
  (array_agg(total_value    order by time desc))[1]  as closing_value,
  (array_agg(cash_value     order by time desc))[1]  as closing_cash,
  (array_agg(invested_value order by time desc))[1]  as closing_invested,
  (array_agg(total_pnl      order by time desc))[1]  as closing_pnl,
  (array_agg(daily_return   order by time desc))[1]  as daily_return_pct,
  (array_agg(currency       order by time desc))[1]  as currency,

  count(*) as snapshot_count
from public.portfolio_snapshots_v2
group by
  date_trunc('day', time)::date,
  user_id
with no data;    -- populate on first REFRESH below

-- Unique index required for REFRESH CONCURRENTLY (non-blocking)
create unique index if not exists daily_portfolio_values_pk
  on public.daily_portfolio_values (bucket, user_id);

-- Supporting indexes for common query patterns
create index if not exists daily_portfolio_values_user_bucket_idx
  on public.daily_portfolio_values (user_id, bucket desc);

-- ── Access control ───────────────────────────────────────────────────────────
-- PostgreSQL does not support RLS on materialized views.
-- This view is read by the FastAPI Portfolio Engine via the service role.
-- End-user access to portfolio history is via query_portfolio_history (migration 005)
-- which queries portfolio_snapshots_v2 directly with auth.uid() filtering.
-- Revoke default public access so only service_role and the backend can query it.
revoke all on public.daily_portfolio_values from anon, authenticated;

-- ── Initial population ───────────────────────────────────────────────────────
-- Runs synchronously on migration deploy.
-- Uses the non-CONCURRENT form (safe when the view is empty).
refresh materialized view public.daily_portfolio_values;

-- =============================================================================
-- FUNCTION: private.refresh_daily_portfolio_values
-- Wrapper called by pg_cron.  Uses CONCURRENTLY so queries are not blocked.
-- =============================================================================
create or replace function private.refresh_daily_portfolio_values()
returns void
language plpgsql
security definer
as $$
begin
  refresh materialized view concurrently public.daily_portfolio_values;
exception when others then
  raise warning 'daily_portfolio_values refresh failed: %', sqlerrm;
end;
$$;

-- ── pg_cron: refresh every hour ──────────────────────────────────────────────
select cron.unschedule('refresh-daily-portfolio-values')
where exists (
  select 1 from cron.job where jobname = 'refresh-daily-portfolio-values'
);

select cron.schedule(
  'refresh-daily-portfolio-values',
  '5 * * * *',           -- 5 minutes past every hour (offset from other jobs)
  $cron$
    select private.refresh_daily_portfolio_values();
  $cron$
);

-- =============================================================================
-- TABLE: performance_cache
-- Pre-computed risk/return metrics per user × period.
-- Written exclusively by the FastAPI Portfolio Engine after each sync.
-- The mobile app and web dashboard read this table directly.
-- One row per (user_id, period) — upserted on every engine run.
-- =============================================================================
create table if not exists public.performance_cache (
  id                uuid          primary key default gen_random_uuid(),
  user_id           uuid          not null references auth.users (id) on delete cascade,

  -- Period window
  period            text          not null
    check (period in ('1D','1W','1M','3M','6M','YTD','1Y','ALL')),

  -- Returns
  total_return      numeric(10,6),   -- decimal: 0.15 = 15 %
  cagr              numeric(10,6),
  daily_return_avg  numeric(10,6),

  -- Risk
  sharpe_ratio      numeric(10,6),
  sortino_ratio     numeric(10,6),
  max_drawdown      numeric(10,6),   -- negative decimal: -0.12 = -12 %
  drawdown_days     integer,
  volatility        numeric(10,6),   -- annualised std dev
  var_95            numeric(10,6),   -- 5th-percentile daily return
  win_rate          numeric(10,6),   -- decimal: 0.55 = 55 %

  -- Benchmark
  benchmark_symbol  text          not null default 'SPY',
  benchmark_return  numeric(10,6),
  alpha             numeric(10,6),
  beta              numeric(10,6),

  -- Snapshot state
  total_value       numeric(20,8),
  position_count    integer,
  cash_pct          numeric(10,6),   -- decimal: 0.12 = 12 %

  computed_at       timestamptz   not null default now(),

  unique (user_id, period)
);

create index if not exists performance_cache_user_idx     on public.performance_cache (user_id);
create index if not exists performance_cache_computed_idx on public.performance_cache (computed_at desc);

alter table public.performance_cache enable row level security;

create policy "Users read own performance_cache"
  on public.performance_cache for select
  using (auth.uid() = user_id);

-- No user insert/update policy — all writes go through the FastAPI backend
-- using the service role key (bypasses RLS).

-- =============================================================================
-- GRANT: authenticated role needs SELECT on the materialized view
-- =============================================================================
-- daily_portfolio_values: service_role only (no authenticated grant — see access control note above)
grant select on public.performance_cache to authenticated;
