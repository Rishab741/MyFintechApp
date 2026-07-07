-- =============================================================================
-- Phase 1: Security & Data Integrity
--
-- 1. Rate Limiting Infrastructure
--    Principle: Defense in Depth + Principle of Least Privilege.
--    Every authenticated edge function must have a burst-protection gate so a
--    single user cannot exhaust Gemini/FRED/engine quotas for all other users.
--
--    Pattern: token-bucket approximated as an hourly counter per (user, function).
--    The INSERT...ON CONFLICT...RETURNING is fully atomic — concurrent requests
--    serialize at the row lock, preventing double-counting without advisory locks.
--
-- 2. S&P 500 Benchmark Automation
--    Principle: Single Source of Truth (SSOT) + Automation.
--    The hardcoded SP500 dict in ml-pipeline was 16 months stale, causing every
--    Sharpe, alpha, and health score calculation to be wrong for ALL users.
--    Fix: daily pg_cron job calls refresh-benchmark-cache edge function, which
--    writes live FRED data into price_cache — the existing SSOT for all prices.
-- =============================================================================


-- ── 1. RATE LIMITING ─────────────────────────────────────────────────────────

-- Stores per-user, per-function call counts in 1-hour rolling windows.
-- Old windows are cleaned up daily so the table stays bounded.
CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  user_id       uuid        NOT NULL,
  function_name text        NOT NULL,
  window_start  timestamptz NOT NULL,
  call_count    int         NOT NULL DEFAULT 1,

  PRIMARY KEY (user_id, function_name, window_start)
);

-- Cleanup index — the daily purge job uses this to avoid a seq-scan
CREATE INDEX IF NOT EXISTS rate_limit_counters_window_idx
  ON public.rate_limit_counters (window_start);

-- Service role only — users never touch this table
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;


-- ── check_and_increment_rate_limit ───────────────────────────────────────────
-- Atomically increments the counter for (user, function, current_hour) and
-- returns (allowed, current_count).
--
-- Why atomic?
--   Without the INSERT...ON CONFLICT...RETURNING pattern, two concurrent
--   requests could both read count=0, both decide they're allowed, and both
--   insert — resulting in double-counting. The upsert serializes this at the
--   storage layer, so exactly one request "wins" each increment slot.
--
-- Called by ml-pipeline and market-intelligence before any expensive operation.
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_user_id    uuid,
  p_function   text,
  p_max_calls  int
)
RETURNS TABLE(allowed boolean, current_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window  timestamptz := date_trunc('hour', now());
  v_count   int;
BEGIN
  INSERT INTO public.rate_limit_counters (user_id, function_name, window_start, call_count)
  VALUES (p_user_id, p_function, v_window, 1)
  ON CONFLICT (user_id, function_name, window_start)
  DO UPDATE SET call_count = rate_limit_counters.call_count + 1
  RETURNING call_count INTO v_count;

  RETURN QUERY SELECT (v_count <= p_max_calls) AS allowed, v_count AS current_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit TO service_role;


-- ── Cleanup: purge counters older than 48 hours ───────────────────────────────
-- Runs at 04:00 UTC daily. Without this, the table would grow without bound
-- at production scale (~1M rows/day for 1,000 DAU × 2 functions × 24 windows).
SELECT cron.schedule(
  'cleanup-rate-limit-counters',
  '0 4 * * *',
  $$DELETE FROM public.rate_limit_counters WHERE window_start < now() - INTERVAL '48 hours'$$
) WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');


-- ── 2. S&P 500 BENCHMARK AUTOMATION ─────────────────────────────────────────

-- The pg_net trigger pattern mirrors build-behavioral-profile (which also uses
-- pg_net to call an edge function from a cron job). The edge function fetches
-- FRED SP500 series and upserts into price_cache (symbol = 'SP500').
CREATE OR REPLACE FUNCTION private.trigger_benchmark_cache_refresh()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_project_url constant text := 'https://dukqphhcjdvxxobclahw.supabase.co';
  v_svc_key     text;
BEGIN
  SELECT decrypted_secret INTO v_svc_key
  FROM vault.decrypted_secrets
  WHERE name = 'ml_service_role_key'
  LIMIT 1;

  IF v_svc_key IS NULL THEN
    RAISE WARNING 'trigger_benchmark_cache_refresh: vault secret ml_service_role_key not found — skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_project_url || '/functions/v1/refresh-benchmark-cache',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_svc_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;


-- Schedule daily at 00:30 UTC.
-- Why 00:30? US markets close at 21:00 UTC, FRED publishes after close,
-- and compute-metrics cron runs at 01:00. 00:30 slots the refresh neatly between.
SELECT cron.schedule(
  'refresh-sp500-benchmark-cache',
  '30 0 * * *',
  'SELECT private.trigger_benchmark_cache_refresh()'
) WHERE EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron');


-- ── Immediate backfill ────────────────────────────────────────────────────────
-- Trigger the refresh now so health scores are fixed without waiting 24 hours.
-- Wrapped in a DO block so a missing vault secret doesn't fail the migration.
DO $$
BEGIN
  PERFORM private.trigger_benchmark_cache_refresh();
  RAISE NOTICE 'Triggered immediate SP500 benchmark cache backfill — health scores will be accurate on next dataset generation.';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not trigger immediate benchmark refresh (vault secret may not be set yet): %', SQLERRM;
END;
$$;
