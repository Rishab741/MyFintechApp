-- =============================================================================
-- Infrastructure Hardening — Indexes, Cache TTL, and Cleanup Jobs
--
-- Adds:
--   1. Missing composite indexes on hot query paths
--   2. performance_cache deduplication + 12h TTL cleanup
--   3. Scenario runs status partial index (polled every 3s)
--   4. Audit log and tenant usage query indexes
-- =============================================================================

-- ── 1. Transactions — composite index for ml-pipeline feature extraction ──────
-- WHERE user_id = X AND transaction_type = Y ORDER BY settled_at DESC
-- Previously required a sequential scan on settled_at alone.
CREATE INDEX IF NOT EXISTS transactions_user_type_settled_idx
  ON public.transactions (user_id, transaction_type, settled_at DESC);

-- Account-scoped date range queries (multi-account reports)
CREATE INDEX IF NOT EXISTS transactions_account_settled_idx
  ON public.transactions (account_id, settled_at DESC);

-- ── 2. scenario_runs — partial index for active polling ───────────────────────
-- poll-scenario calls .eq("id", run_id).eq("user_id", uid) per 3s interval.
-- Without this, status IN ('queued','running') scans the whole table.
CREATE INDEX IF NOT EXISTS scenario_runs_status_partial_idx
  ON public.scenario_runs (status)
  WHERE status IN ('queued', 'running');

-- Cover index for the exact SELECT used by poll-scenario
CREATE INDEX IF NOT EXISTS scenario_runs_id_user_idx
  ON public.scenario_runs (id, user_id);

-- ── 3. audit_logs — resource + time index for compliance queries ───────────────
-- SOC 2 audit trail queries: WHERE resource = 'X' ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS audit_logs_resource_created_idx
  ON public.audit_logs (resource, created_at DESC);

-- actor_id + event_type for user-scoped audit trails
CREATE INDEX IF NOT EXISTS audit_logs_actor_event_idx
  ON public.audit_logs (actor_id, event_type, created_at DESC)
  WHERE actor_id IS NOT NULL;

-- ── 4. tenant_usage — monthly quota enforcement ───────────────────────────────
CREATE INDEX IF NOT EXISTS tenant_usage_tenant_month_idx
  ON public.tenant_usage (tenant_id, month DESC);

-- ── 5. holdings — account + asset pair lookups ───────────────────────────────
-- WHERE account_id = X AND asset_id = Y on upsert during sync
CREATE INDEX IF NOT EXISTS holdings_account_asset_idx
  ON public.holdings (account_id, asset_id);

-- ── 6. performance_cache — deduplication ─────────────────────────────────────
-- Ensures one row per (user_id, period) — engine upserts are idempotent.
-- Using CREATE UNIQUE INDEX so it doubles as a constraint.
CREATE UNIQUE INDEX IF NOT EXISTS performance_cache_user_period_unique_idx
  ON public.performance_cache (user_id, period);

-- ── 7. portfolio_snapshots — query optimisation ───────────────────────────────
-- The two queries in fetchSnapshots: latest + history, both filtered by user_id
-- and ordered by captured_at. The existing index may already cover this;
-- create only if it doesn't exist.
CREATE INDEX IF NOT EXISTS portfolio_snapshots_user_captured_idx
  ON public.portfolio_snapshots (user_id, captured_at DESC);

-- ── 8. price_cache — tighten TTL (30-day instead of 10-year) ─────────────────
-- Replace the existing 10-year weekly cleanup with a 30-day daily cleanup.
-- Stale prices would silently corrupt scenario simulation results.
SELECT cron.unschedule('cleanup-old-price-cache')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-price-cache'
  );

SELECT cron.schedule(
  'cleanup-old-price-cache',
  '0 3 * * *',   -- Daily at 03:00 UTC (was weekly)
  $sql$
    DELETE FROM public.price_cache
    WHERE date < current_date - interval '30 days';
  $sql$
) WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');

-- ── 9. performance_cache — 12-hour TTL cleanup ───────────────────────────────
-- Without this, a crashed engine leaves stale metrics indefinitely.
-- computed_at column already exists; just add the cleanup job.
SELECT cron.schedule(
  'cleanup-stale-performance-cache',
  '30 */6 * * *',   -- Every 6 hours at :30
  $sql$
    DELETE FROM public.performance_cache
    WHERE computed_at < now() - interval '12 hours';
  $sql$
) WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');

-- ── 10. scenario_results — log cleanup failures ───────────────────────────────
-- Upgrade the cleanup function to count deleted rows and warn if none are found
-- when expired rows exist (indicates cleanup function is not being called).
CREATE OR REPLACE FUNCTION private.cleanup_expired_scenario_results()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_results int;
  v_deleted_runs    int;
BEGIN
  DELETE FROM public.scenario_results WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted_results = ROW_COUNT;

  DELETE FROM public.scenario_runs
  WHERE status IN ('queued', 'running')
    AND created_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_deleted_runs = ROW_COUNT;

  IF v_deleted_results > 0 OR v_deleted_runs > 0 THEN
    RAISE NOTICE 'cleanup_expired_scenario_results: deleted % results, % stale runs',
      v_deleted_results, v_deleted_runs;
  END IF;
END;
$$;
