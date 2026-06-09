-- Fix query_scenarios view: expose updated_at so PostgREST can order by it.
-- The original view used updated_at only in the internal ORDER BY clause,
-- making it invisible to the REST layer → 400 on ?order=updated_at.desc.
--
-- CREATE OR REPLACE VIEW cannot insert a column in the middle of the column list
-- (Postgres treats it as a rename → error 42P16). DROP + CREATE is required.

drop view if exists public.query_scenarios;

create view public.query_scenarios
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
  -- Latest run status (lateral join — one row per scenario)
  r.status        as last_run_status,
  r.completed_at  as last_completed_at,
  r.error_message as last_error,
  -- updated_at appended at the end so column positions are preserved
  s.updated_at
from public.scenarios s
left join lateral (
  select status, completed_at, error_message
  from public.scenario_runs
  where scenario_id = s.id
  order by created_at desc
  limit 1
) r on true
where s.user_id = auth.uid();

grant select on public.query_scenarios to authenticated;
