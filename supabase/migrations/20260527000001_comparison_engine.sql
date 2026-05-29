-- =============================================================================
-- Vestara Counterfactual Intelligence Engine (VCIE) — Database Schema
--
-- New tables (all scoped per user_id with RLS):
--   scenarios                  — saved simulation configurations
--   scenario_runs              — async job tracking (one per execution)
--   scenario_results           — computed output (JSONB, 7-day TTL)
--   behavioral_profiles        — BTF fingerprint derived from transactions
--   price_cache                — historical daily adj-close per symbol
--   comparison_asset_universe  — curated catalogue of comparable assets
--
-- Hooks into existing tables:
--   transactions INSERT  → queues behavioral_profile rebuild via pg_net
--   pg_cron daily        → purge expired scenario_results + stale price_cache
-- =============================================================================

-- ── comparison_asset_universe ─────────────────────────────────────────────────
-- Master list of assets users can compare against.  Populated by seed migration.
-- Public read, service-role write.

create table if not exists public.comparison_asset_universe (
  symbol            text        primary key,
  name              text        not null,
  asset_class       text        not null
    check (asset_class in ('equity','etf','crypto','forex','commodity','index','bond')),
  sector            text,
  exchange          text,
  currency          text        not null default 'USD',
  is_featured       boolean     not null default false,
  earliest_date     date,
  description       text,
  logo_url          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists cau_asset_class_idx on public.comparison_asset_universe (asset_class);
create index if not exists cau_featured_idx    on public.comparison_asset_universe (is_featured) where is_featured;

-- Public read: anyone authenticated can see the universe
alter table public.comparison_asset_universe enable row level security;

create policy "cau_read_authenticated"
  on public.comparison_asset_universe for select
  to authenticated using (true);

-- ── price_cache ───────────────────────────────────────────────────────────────
-- Daily adjusted-close prices for all comparison assets.
-- symbol = Yahoo Finance ticker (e.g. 'BTC-USD', 'SPY', 'NVDA').
-- Populated by the Python engine's /v1/simulate/backfill-prices endpoint.
-- No FK to assets table — comparison assets may not be in the portfolio.

create table if not exists public.price_cache (
  symbol      text        not null,
  date        date        not null,
  open        numeric(20,8),
  high        numeric(20,8),
  low         numeric(20,8),
  close       numeric(20,8) not null,
  adj_close   numeric(20,8) not null,
  volume      bigint,
  dividend    numeric(20,8) not null default 0,
  split_factor numeric(10,6) not null default 1,
  source      text        not null default 'yahoo',
  fetched_at  timestamptz not null default now(),
  primary key (symbol, date)
);

create index if not exists price_cache_symbol_date_idx on public.price_cache (symbol, date desc);
create index if not exists price_cache_date_idx        on public.price_cache (date desc);

-- Price cache is service-role only (populated by engine, never by end users)
alter table public.price_cache enable row level security;

create policy "price_cache_read_authenticated"
  on public.price_cache for select
  to authenticated using (true);

-- ── scenarios ─────────────────────────────────────────────────────────────────
-- A saved simulation configuration owned by a user.

create table if not exists public.scenarios (
  id                          uuid        primary key default gen_random_uuid(),
  user_id                     uuid        not null references auth.users (id) on delete cascade,

  name                        text        not null default 'Untitled Scenario',
  description                 text,

  -- Assets to compare (Yahoo Finance symbols)
  comparison_assets           text[]      not null default '{}',

  -- Time window
  period_start                date,       -- null = use earliest available data
  period_end                  date,       -- null = today

  -- Capital basis
  initial_capital             numeric(20,8), -- null = use actual portfolio value on period_start
  currency                    text        not null default 'USD',

  -- Simulation options
  rebalancing_strategy        text        not null default 'hold'
    check (rebalancing_strategy in ('hold','monthly','quarterly','threshold_10pct','threshold_20pct')),
  apply_behavioral_adjustment boolean     not null default true,
  apply_dividend_reinvestment boolean     not null default true,
  apply_tax_simulation        boolean     not null default false,
  run_monte_carlo             boolean     not null default false,

  -- Lifecycle
  is_bookmarked               boolean     not null default false,
  last_run_at                 timestamptz,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists scenarios_user_id_idx       on public.scenarios (user_id, created_at desc);
create index if not exists scenarios_bookmarked_idx    on public.scenarios (user_id, is_bookmarked) where is_bookmarked;

alter table public.scenarios enable row level security;

create policy "scenarios_select_own" on public.scenarios for select  using (auth.uid() = user_id);
create policy "scenarios_insert_own" on public.scenarios for insert  with check (auth.uid() = user_id);
create policy "scenarios_update_own" on public.scenarios for update  using (auth.uid() = user_id);
create policy "scenarios_delete_own" on public.scenarios for delete  using (auth.uid() = user_id);

create trigger scenarios_updated_at
  before update on public.scenarios
  for each row execute function private.set_updated_at();

-- ── scenario_runs ─────────────────────────────────────────────────────────────
-- One row per execution of a scenario.  Tracks async engine job state.

create table if not exists public.scenario_runs (
  id              uuid        primary key default gen_random_uuid(),
  scenario_id     uuid        not null references public.scenarios (id) on delete cascade,
  user_id         uuid        not null references auth.users (id) on delete cascade,

  status          text        not null default 'queued'
    check (status in ('queued','running','complete','failed')),

  -- Python engine's internal async job identifier
  engine_job_id   text,

  -- Timing
  started_at      timestamptz,
  completed_at    timestamptz,

  -- Error detail when status = 'failed'
  error_message   text,
  error_code      text,

  -- Snapshot of the scenario config at run time (immutable after creation)
  config_snapshot jsonb       not null default '{}',

  created_at      timestamptz not null default now()
);

create index if not exists scenario_runs_scenario_idx  on public.scenario_runs (scenario_id, created_at desc);
create index if not exists scenario_runs_user_idx      on public.scenario_runs (user_id, created_at desc);
create index if not exists scenario_runs_status_idx    on public.scenario_runs (status) where status in ('queued','running');

alter table public.scenario_runs enable row level security;

create policy "scenario_runs_select_own" on public.scenario_runs for select  using (auth.uid() = user_id);
create policy "scenario_runs_insert_own" on public.scenario_runs for insert  with check (auth.uid() = user_id);
create policy "scenario_runs_update_own" on public.scenario_runs for update  using (auth.uid() = user_id);

-- ── scenario_results ──────────────────────────────────────────────────────────
-- Computed output for a completed run.  All heavy data in JSONB for flexibility.
-- Expires after 7 days to control storage costs.

create table if not exists public.scenario_results (
  id                          uuid        primary key default gen_random_uuid(),
  run_id                      uuid        not null references public.scenario_runs (id) on delete cascade,
  user_id                     uuid        not null references auth.users (id) on delete cascade,

  -- ── Core outputs ──────────────────────────────────────────────────────────
  -- Array of {date, actual, <symbol>: value, ...} — one row per trading day
  timeseries                  jsonb       not null default '[]',

  -- Per-series metrics: {actual: {return, sharpe, sortino, max_drawdown, ...}, SPY: {...}}
  metrics                     jsonb       not null default '{}',

  -- ── VCIE novel outputs ────────────────────────────────────────────────────
  -- Decision Impact Tree: nodes + edges + impact_score
  decision_tree               jsonb       not null default '{}',

  -- Top-5 decisions ranked by portfolio impact (positive or negative)
  inflection_points           jsonb       not null default '[]',

  -- Temporal Opportunity Index metrics
  temporal_opportunity        jsonb       not null default '{}',

  -- Behavioral profile snapshot used during this simulation
  behavioral_profile_snapshot jsonb       not null default '{}',

  -- Monte Carlo: {p10, p25, p50, p75, p90} arrays per series (if requested)
  monte_carlo                 jsonb,

  -- ── Metadata ──────────────────────────────────────────────────────────────
  computation_ms              int,        -- wall-clock time for the simulation
  data_quality_score          numeric(4,3), -- 0-1: fraction of days with real prices

  expires_at                  timestamptz not null default now() + interval '7 days',
  created_at                  timestamptz not null default now()
);

-- Only one result per run
create unique index if not exists scenario_results_run_id_idx on public.scenario_results (run_id);
create index if not exists scenario_results_user_idx          on public.scenario_results (user_id, created_at desc);
create index if not exists scenario_results_expires_idx       on public.scenario_results (expires_at);

alter table public.scenario_results enable row level security;

create policy "scenario_results_select_own" on public.scenario_results for select  using (auth.uid() = user_id);
create policy "scenario_results_insert_own" on public.scenario_results for insert  with check (auth.uid() = user_id);

-- ── behavioral_profiles ───────────────────────────────────────────────────────
-- Behavioral Transaction Fingerprint (BTF) derived from the user's real trades.
-- One row per user; rebuilt whenever new transactions arrive.

create table if not exists public.behavioral_profiles (
  user_id                     uuid        primary key references auth.users (id) on delete cascade,

  -- ── Holding behaviour ─────────────────────────────────────────────────────
  avg_holding_days            numeric(10,2),   -- mean days between buy and sell of same symbol
  median_holding_days         numeric(10,2),
  max_holding_days            numeric(10,2),

  -- ── Exit behaviour ────────────────────────────────────────────────────────
  -- Drawdown (%) at time of sell, averaged over all loss-making exits
  avg_exit_drawdown_pct       numeric(8,4),
  -- Probability user exits when portfolio drops > 10 %
  panic_sell_probability_10   numeric(5,4),
  -- Probability user exits when portfolio drops > 20 %
  panic_sell_probability_20   numeric(5,4),

  -- ── Entry behaviour ───────────────────────────────────────────────────────
  -- P(buy | market is down ≥ 10 % from recent peak) — "buy the dip" tendency
  buy_dip_probability         numeric(5,4),
  -- Average days between transaction dates (trading frequency)
  avg_days_between_trades     numeric(10,2),

  -- ── Position sizing ───────────────────────────────────────────────────────
  avg_position_size_pct       numeric(8,4),   -- avg single position as % of portfolio
  max_position_concentration  numeric(8,4),   -- largest single-asset weight ever observed

  -- ── Composite scores (all 0–1 unless noted) ───────────────────────────────
  loss_aversion_score         numeric(5,4),   -- 0 = fearless, 1 = extreme loss aversion
  -- Timing quality: +1 = always bought low/sold high, -1 = always the opposite
  timing_quality_score        numeric(5,4),
  -- Diversification tendency: 1 = highly concentrated, 0 = well diversified
  concentration_score         numeric(5,4),

  -- ── Confidence ───────────────────────────────────────────────────────────
  transaction_count           int         not null default 0,
  -- 'insufficient' (<5 tx), 'low' (5-20), 'medium' (20-50), 'high' (>50)
  profile_confidence          text        not null default 'insufficient'
    check (profile_confidence in ('insufficient','low','medium','high')),

  -- ── Aggregate opt-in ──────────────────────────────────────────────────────
  -- When true, anonymised metrics feed the CPPI aggregate dataset
  opted_into_aggregate        boolean     not null default false,

  derived_at                  timestamptz not null default now(),
  created_at                  timestamptz not null default now()
);

alter table public.behavioral_profiles enable row level security;

create policy "bp_select_own" on public.behavioral_profiles for select  using (auth.uid() = user_id);
create policy "bp_insert_own" on public.behavioral_profiles for insert  with check (auth.uid() = user_id);
create policy "bp_update_own" on public.behavioral_profiles for update  using (auth.uid() = user_id);

-- ── Query views ───────────────────────────────────────────────────────────────

create or replace view public.query_scenarios
with (security_invoker = true)
as
select
  s.id,
  s.name,
  s.description,
  s.comparison_assets,
  s.period_start,
  s.period_end,
  s.initial_capital,
  s.rebalancing_strategy,
  s.apply_behavioral_adjustment,
  s.is_bookmarked,
  s.last_run_at,
  s.created_at,
  -- Latest run status
  r.status        as last_run_status,
  r.completed_at  as last_completed_at,
  r.error_message as last_error
from public.scenarios s
left join lateral (
  select status, completed_at, error_message
  from public.scenario_runs
  where scenario_id = s.id
  order by created_at desc
  limit 1
) r on true
where s.user_id = auth.uid()
order by s.updated_at desc;

grant select on public.query_scenarios to authenticated;

create or replace view public.query_behavioral_profile
with (security_invoker = true)
as
select
  avg_holding_days,
  median_holding_days,
  avg_exit_drawdown_pct,
  panic_sell_probability_10,
  panic_sell_probability_20,
  buy_dip_probability,
  avg_days_between_trades,
  avg_position_size_pct,
  loss_aversion_score,
  timing_quality_score,
  concentration_score,
  transaction_count,
  profile_confidence,
  opted_into_aggregate,
  derived_at
from public.behavioral_profiles
where user_id = auth.uid();

grant select on public.query_behavioral_profile to authenticated;

-- ── Trigger: queue behavioral profile rebuild on new transaction ──────────────
-- Calls the build-behavioral-profile edge function asynchronously via pg_net
-- so the profile stays fresh without blocking the transaction write.

create or replace function private.queue_behavioral_profile_rebuild()
returns trigger
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_project_url constant text := 'https://dukqphhcjdvxxobclahw.supabase.co';
  v_svc_key     text;
begin
  select decrypted_secret into v_svc_key
  from vault.decrypted_secrets
  where name = 'ml_service_role_key'
  limit 1;

  if v_svc_key is null then
    raise warning 'queue_behavioral_profile_rebuild: vault secret not found';
    return new;
  end if;

  perform net.http_post(
    url     := v_project_url || '/functions/v1/build-behavioral-profile',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_svc_key
    ),
    body    := jsonb_build_object('user_id', new.user_id::text)
  );

  return new;
exception when others then
  raise warning 'queue_behavioral_profile_rebuild failed for user %: %', new.user_id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists rebuild_behavioral_profile_on_tx on public.transactions;

create trigger rebuild_behavioral_profile_on_tx
  after insert on public.transactions
  for each row
  execute function private.queue_behavioral_profile_rebuild();

-- ── Cleanup cron jobs ─────────────────────────────────────────────────────────

-- Purge expired scenario results daily at 02:00 UTC
create or replace function private.cleanup_expired_scenario_results()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.scenario_results where expires_at < now();
  delete from public.scenario_runs
  where status in ('queued','running')
    and created_at < now() - interval '2 hours';
end;
$$;

select cron.schedule(
  'cleanup-expired-scenario-results',
  '0 2 * * *',
  'select private.cleanup_expired_scenario_results()'
) where exists (select 1 from pg_extension where extname = 'pg_cron');

-- Purge price_cache entries older than 10 years (keep history manageable)
select cron.schedule(
  'cleanup-old-price-cache',
  '0 3 * * 0',    -- weekly, Sunday 03:00 UTC
  $sql$
    delete from public.price_cache
    where date < current_date - interval '10 years';
  $sql$
) where exists (select 1 from pg_extension where extname = 'pg_cron');
