-- =============================================================================
-- Widen performance_cache numeric columns
--
-- NUMERIC(10, 6) allows a max absolute value of 9999.999999.
-- Several columns legitimately exceed this:
--
--   cagr            — annualises with (1+twr)^(365/days); a 1W period uses
--                     exponent 52, easily producing values in the thousands.
--   sortino_ratio   — returns ±inf when there are zero losing days.
--   sharpe_ratio    — same reasoning.
--   alpha, beta     — extreme for thinly-traded or leveraged assets.
--   benchmark_return— annualised rate, not the raw daily-return sum.
--   total_return    — TWR over long periods can compound past 9999%.
--   volatility      — annualised std dev * √252; crypto can exceed 1000%.
--
-- PostgreSQL does not allow ALTER COLUMN TYPE on columns used by a view.
-- The pattern is: DROP VIEW → ALTER TABLE → RECREATE VIEW.
-- =============================================================================

-- ── Step 1: drop the dependent view ──────────────────────────────────────────
drop view if exists public.query_performance;

-- ── Step 2: widen the columns ─────────────────────────────────────────────────
alter table public.performance_cache
    alter column total_return     type numeric(20, 6),
    alter column cagr             type numeric(20, 6),
    alter column daily_return_avg type numeric(20, 6),
    alter column sharpe_ratio     type numeric(20, 6),
    alter column sortino_ratio    type numeric(20, 6),
    alter column max_drawdown     type numeric(20, 6),
    alter column volatility       type numeric(20, 6),
    alter column var_95           type numeric(20, 6),
    alter column win_rate         type numeric(20, 6),
    alter column benchmark_return type numeric(20, 6),
    alter column alpha            type numeric(20, 6),
    alter column beta             type numeric(20, 6);

-- ── Step 3: recreate the view (identical to migration 005) ───────────────────
create view public.query_performance
with (security_invoker = true)
as
select
  period,
  round(total_return    * 100, 2)   as total_return_pct,
  round(cagr            * 100, 2)   as cagr_pct,
  round(sharpe_ratio,   3)          as sharpe_ratio,
  round(sortino_ratio,  3)          as sortino_ratio,
  round(max_drawdown    * 100, 2)   as max_drawdown_pct,
  drawdown_days,
  round(volatility      * 100, 2)   as volatility_pct,
  round(win_rate        * 100, 2)   as win_rate_pct,
  round(var_95          * 100, 2)   as var_95_pct,
  benchmark_symbol,
  round(benchmark_return * 100, 2)  as benchmark_return_pct,
  round(alpha           * 100, 2)   as alpha_pct,
  round(beta,           3)          as beta,
  total_value                       as portfolio_value,
  position_count,
  round(cash_pct        * 100, 2)   as cash_pct,
  computed_at
from public.performance_cache
where user_id = auth.uid();

-- Restore grants
grant select on public.query_performance to authenticated;
