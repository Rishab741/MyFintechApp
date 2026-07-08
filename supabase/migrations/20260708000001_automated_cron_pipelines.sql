-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Automated cron pipelines
--
-- Adds two nightly pg_cron jobs that keep every user's portfolio data fresh
-- without requiring a manual trigger from the mobile app or dashboard:
--
--   00:05 UTC  →  POST /v1/sync/prices/all   (refresh holding prices)
--   01:00 UTC  →  POST /v1/sync/compute/all  (recompute performance_cache)
--
-- Architecture note — why pg_cron → pg_net → engine (not a cron container):
--   The engine is already running on Railway. pg_cron + pg_net means we
--   schedule HTTP calls from within Postgres itself, requiring zero additional
--   infrastructure. Both jobs return 202 immediately (background tasks) so
--   the pg_net call completes before any HTTP timeout.
--
-- Prerequisites (must already be installed):
--   CREATE EXTENSION IF NOT EXISTS pg_cron;
--   CREATE EXTENSION IF NOT EXISTS pg_net;
--
-- Secrets required in Supabase Vault:
--   engine_service_key  — matches ENGINE_SERVICE_KEY in services/engine/.env
--   engine_url          — e.g. https://myfintechapp-production.up.railway.app
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Audit trail for automated pipeline runs ──────────────────────────────────
-- Lightweight table so the dashboard can show "last synced at X".
-- The engine also writes to audit_log, but this table gives a Postgres-side
-- record of every scheduled trigger — useful to debug cases where the engine
-- never received the call (network, vault secret wrong, etc).

CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pipeline    text        NOT NULL,                   -- 'prices_all' | 'compute_all'
  triggered_at timestamptz NOT NULL DEFAULT now(),
  pg_net_id   bigint,                                 -- net.http_post() request ID for correlation
  engine_url  text        NOT NULL
);

-- RLS: only the service role can read this table (cron jobs use service role).
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

-- No user-facing policy needed — this table is internal telemetry only.


-- ── Helper: call engine POST endpoint ────────────────────────────────────────
-- Shared by both pipeline trigger functions below.

CREATE OR REPLACE FUNCTION private.call_engine(p_path text)
RETURNS bigint                    -- returns the pg_net request ID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public
AS $$
DECLARE
  v_engine_url   text;
  v_service_key  text;
  v_request_id   bigint;
BEGIN
  -- Read secrets from Vault at call time (not cached) so key rotation takes
  -- effect immediately without a DB restart.
  SELECT decrypted_secret INTO v_engine_url
  FROM   vault.decrypted_secrets
  WHERE  name = 'engine_url'
  LIMIT  1;

  SELECT decrypted_secret INTO v_service_key
  FROM   vault.decrypted_secrets
  WHERE  name = 'engine_service_key'
  LIMIT  1;

  IF v_engine_url IS NULL OR v_service_key IS NULL THEN
    RAISE WARNING 'private.call_engine: engine_url or engine_service_key not found in vault — skipping';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := v_engine_url || p_path,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body             := '{}'::jsonb,
    timeout_milliseconds := 10000    -- engine returns 202 quickly; 10s is generous
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;


-- ── Pipeline trigger functions ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.trigger_price_sync_all()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public
AS $$
DECLARE
  v_request_id bigint;
  v_engine_url text;
BEGIN
  SELECT decrypted_secret INTO v_engine_url
  FROM vault.decrypted_secrets WHERE name = 'engine_url' LIMIT 1;

  v_request_id := private.call_engine('/v1/sync/prices/all');

  INSERT INTO public.pipeline_runs (pipeline, pg_net_id, engine_url)
  VALUES ('prices_all', v_request_id, COALESCE(v_engine_url, 'unknown'));
END;
$$;


CREATE OR REPLACE FUNCTION private.trigger_compute_all()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public
AS $$
DECLARE
  v_request_id bigint;
  v_engine_url text;
BEGIN
  SELECT decrypted_secret INTO v_engine_url
  FROM vault.decrypted_secrets WHERE name = 'engine_url' LIMIT 1;

  v_request_id := private.call_engine('/v1/sync/compute/all');

  INSERT INTO public.pipeline_runs (pipeline, pg_net_id, engine_url)
  VALUES ('compute_all', v_request_id, COALESCE(v_engine_url, 'unknown'));
END;
$$;


-- ── Schedule the two nightly jobs ─────────────────────────────────────────────
-- Prices first (00:05), then compute (01:00) — compute needs fresh prices.
-- Times are UTC. The 55-minute gap is intentional: price sync across all
-- users finishes well within that window even at high user counts.

-- Remove existing schedules if re-running this migration.
SELECT cron.unschedule('nightly-price-sync-all')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'nightly-price-sync-all'
);

SELECT cron.unschedule('nightly-compute-all')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'nightly-compute-all'
);

SELECT cron.schedule(
  'nightly-price-sync-all',
  '5 0 * * *',           -- 00:05 UTC every day
  $$SELECT private.trigger_price_sync_all()$$
);

SELECT cron.schedule(
  'nightly-compute-all',
  '0 1 * * *',           -- 01:00 UTC every day
  $$SELECT private.trigger_compute_all()$$
);


-- ── Store engine_url in Vault (idempotent) ────────────────────────────────────
-- Run this block manually once after deploying if the secret is not yet set.
-- Wrapped in a DO block so a missing vault extension doesn't fail the migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'engine_url'
  ) THEN
    PERFORM vault.create_secret(
      'https://myfintechapp-production.up.railway.app',
      'engine_url',
      'Platstock Portfolio Engine base URL (Railway)'
    );
    RAISE NOTICE 'Vault secret engine_url created.';
  ELSE
    RAISE NOTICE 'Vault secret engine_url already exists — skipping.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not write engine_url to vault: % — set it manually.', SQLERRM;
END;
$$;
