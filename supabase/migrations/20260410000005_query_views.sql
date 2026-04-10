-- =============================================================================
-- Phase 1 — LLM Query Views
--
-- The LLM Query Engine (Phase 3) is ONLY allowed to SELECT from these views —
-- never from the base tables directly.  This is the primary SQL injection and
-- data-leakage guardrail.
--
-- Design rules:
--   1. Every view filters by auth.uid() so users can never see each other's data
--      even if the LLM generates a query without a WHERE clause.
--   2. Views expose human-readable column names (no internal UUIDs leaking out).
--   3. Sensitive columns (access_token, user_secret, ip_address) are excluded.
--   4. All views are prefixed "query_" so the validator can whitelist by name.
--
-- The FastAPI query engine will inject the following into every system prompt:
--   "You may only SELECT from views whose names begin with query_.
--    Every view already filters to the authenticated user's data.
--    Never use subqueries. Never use UNION. Return at most 500 rows."
-- =============================================================================

-- ── Helper: current user's UUID (used in all view filters) ────────────────────
-- Views reference auth.uid() directly; no helper function needed.

-- =============================================================================
-- VIEW: query_portfolio_summary
-- Top-level portfolio overview per user.
-- Answers: "What is my total portfolio value?",
--          "How much cash do I have?",
--          "How many positions do I hold?"
-- =============================================================================
create or replace view public.query_portfolio_summary
with (security_invoker = true)       -- RLS evaluated as the calling user, not owner
as
select
  -- Latest snapshot NAV
  v.total_value                                               as portfolio_value,
  v.cash_value                                               as cash,
  v.invested_value                                           as invested,
  v.total_pnl                                                as unrealised_pnl,
  v.currency,
  v.time                                                     as last_snapshot_at,

  -- Live position count (from holdings, not snapshots)
  coalesce(h.position_count, 0)                              as position_count,

  -- Connected accounts count
  coalesce(a.account_count, 0)                               as account_count

from (
  -- Most recent snapshot per user
  select distinct on (user_id)
    user_id, total_value, cash_value, invested_value,
    total_pnl, currency, time
  from public.portfolio_snapshots_v2
  where user_id = auth.uid()
  order by user_id, time desc
) v
left join (
  select user_id, count(*) as position_count
  from public.holdings
  where user_id = auth.uid()
    and quantity > 0
  group by user_id
) h on h.user_id = v.user_id
left join (
  select user_id, count(*) as account_count
  from public.accounts
  where user_id = auth.uid()
    and is_active
  group by user_id
) a on a.user_id = v.user_id;

-- =============================================================================
-- VIEW: query_holdings
-- Current positions with asset metadata.
-- Answers: "What stocks do I own?",
--          "Show me my crypto exposure",
--          "Which positions are in profit?"
-- =============================================================================
create or replace view public.query_holdings
with (security_invoker = true)
as
select
  a.symbol,
  a.name                                                     as asset_name,
  a.asset_class,
  a.sector,
  a.exchange,
  h.quantity,
  h.avg_cost_basis                                           as cost_per_unit,
  h.last_price                                               as current_price,
  h.currency,
  round(h.quantity * h.last_price, 2)                        as market_value,
  round(h.quantity * coalesce(h.avg_cost_basis, 0), 2)       as cost_basis_total,
  h.open_pnl                                                 as unrealised_pnl,
  h.open_pnl_pct                                             as unrealised_pnl_pct,
  h.last_price_at                                            as price_updated_at,
  acc.institution_name                                       as account,
  acc.account_type
from public.holdings h
join public.assets   a   on a.id   = h.asset_id
join public.accounts acc on acc.id = h.account_id
where h.user_id = auth.uid()
  and h.quantity > 0;

-- =============================================================================
-- VIEW: query_transactions
-- Full transaction history with human-readable context.
-- Answers: "Show me all my buy transactions this year",
--          "What dividends did I receive last quarter?",
--          "How much have I deposited total?"
-- =============================================================================
create or replace view public.query_transactions
with (security_invoker = true)
as
select
  t.transaction_type                                         as type,
  t.settled_at                                               as date,
  coalesce(a.symbol, t.symbol, 'CASH')                      as symbol,
  coalesce(a.name, t.symbol, 'Cash')                        as asset_name,
  a.asset_class,
  t.quantity,
  t.price                                                    as execution_price,
  t.gross_amount,
  t.fees,
  t.net_amount,
  t.currency,
  acc.institution_name                                       as account,
  t.notes
from public.transactions t
left join public.assets   a   on a.id   = t.asset_id
join public.accounts      acc on acc.id = t.account_id
where t.user_id = auth.uid()
order by t.settled_at desc;

-- =============================================================================
-- VIEW: query_performance
-- Pre-computed risk/return metrics per time period.
-- Answers: "What is my Sharpe ratio?",
--          "How did I perform vs the S&P 500 this year?",
--          "What is my max drawdown?"
-- =============================================================================
create or replace view public.query_performance
with (security_invoker = true)
as
select
  period,
  round(total_return    * 100, 2)                            as total_return_pct,
  round(cagr            * 100, 2)                            as cagr_pct,
  round(sharpe_ratio,   3)                                   as sharpe_ratio,
  round(sortino_ratio,  3)                                   as sortino_ratio,
  round(max_drawdown    * 100, 2)                            as max_drawdown_pct,
  drawdown_days,
  round(volatility      * 100, 2)                            as volatility_pct,
  round(win_rate        * 100, 2)                            as win_rate_pct,
  round(var_95          * 100, 2)                            as var_95_pct,
  benchmark_symbol,
  round(benchmark_return * 100, 2)                           as benchmark_return_pct,
  round(alpha           * 100, 2)                            as alpha_pct,
  round(beta,           3)                                   as beta,
  total_value                                                as portfolio_value,
  position_count,
  round(cash_pct        * 100, 2)                            as cash_pct,
  computed_at
from public.performance_cache
where user_id = auth.uid();

-- =============================================================================
-- VIEW: query_portfolio_history
-- Daily NAV history for charting and trend analysis.
-- Answers: "Show me my portfolio value over the last 3 months",
--          "When did my portfolio peak?",
--          "What was my worst day this year?"
-- =============================================================================
create or replace view public.query_portfolio_history
with (security_invoker = true)
as
select
  -- Use the continuous aggregate if TimescaleDB is available;
  -- fall back to raw portfolio_snapshots_v2 otherwise.
  -- We query the underlying table here — the continuous aggregate
  -- is for the Portfolio Engine's internal use.
  date_trunc('day', time)                                    as date,
  round(total_value, 2)                                      as portfolio_value,
  round(cash_value, 2)                                       as cash,
  round(invested_value, 2)                                   as invested,
  round(total_pnl, 2)                                        as unrealised_pnl,
  round(daily_return * 100, 4)                               as daily_return_pct,
  currency
from public.portfolio_snapshots_v2
where user_id = auth.uid()
order by time desc;

-- =============================================================================
-- VIEW: query_asset_exposure
-- Aggregated portfolio exposure by asset class, sector, and currency.
-- Answers: "What is my tech sector exposure?",
--          "Am I overweight crypto?",
--          "What percentage is in USD vs AUD?"
-- =============================================================================
create or replace view public.query_asset_exposure
with (security_invoker = true)
as
with portfolio_total as (
  select sum(quantity * last_price) as total_value
  from public.holdings
  where user_id = auth.uid()
    and quantity > 0
    and last_price is not null
)
select
  a.asset_class,
  a.sector,
  h.currency,
  count(distinct h.asset_id)                                 as position_count,
  round(sum(h.quantity * h.last_price), 2)                   as market_value,
  round(
    sum(h.quantity * h.last_price) / nullif(pt.total_value, 0) * 100,
    2
  )                                                          as allocation_pct,
  round(sum(h.open_pnl), 2)                                  as total_pnl
from public.holdings h
join public.assets   a  on a.id = h.asset_id
cross join portfolio_total pt
where h.user_id = auth.uid()
  and h.quantity > 0
  and h.last_price is not null
group by a.asset_class, a.sector, h.currency, pt.total_value
order by market_value desc;

-- =============================================================================
-- VIEW: query_accounts
-- Connected brokerage and bank accounts (no sensitive tokens).
-- Answers: "What accounts do I have connected?",
--          "When was my account last synced?"
-- =============================================================================
create or replace view public.query_accounts
with (security_invoker = true)
as
select
  provider,
  institution_name,
  account_name,
  account_number,
  account_type,
  currency,
  is_active,
  last_synced_at
from public.accounts
where user_id  = auth.uid()
  and is_active
order by created_at;

-- =============================================================================
-- SECURITY: explicit GRANT on all query_ views to authenticated role
-- (Supabase's anon / authenticated roles need explicit grants on views)
-- =============================================================================
grant select on public.query_portfolio_summary  to authenticated;
grant select on public.query_holdings           to authenticated;
grant select on public.query_transactions       to authenticated;
grant select on public.query_performance        to authenticated;
grant select on public.query_portfolio_history  to authenticated;
grant select on public.query_asset_exposure     to authenticated;
grant select on public.query_accounts           to authenticated;
