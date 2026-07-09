-- Connection health tracking for snaptrade_connections.
--
-- Adds:
--   status          — current health state, kept up to date by the edge function and cron
--   last_verified_at — when we last successfully called SnapTrade and confirmed the auth works
--   sync_error      — last error message from a failed holdings fetch (for UI display)
--
-- A pg_cron job verifies all active connections nightly via the engine.
-- The edge function updates status in-line when a holdings fetch returns 401/403.

-- ── 1. Status enum ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE snaptrade_connection_status AS ENUM (
    'healthy',      -- last holdings fetch succeeded
    'stale',        -- connected but no successful fetch in > 24 h
    'expired',      -- brokerage returned 401/403 — user must reconnect
    'disconnected'  -- row exists but account_id is NULL (soft delete)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. New columns ─────────────────────────────────────────────────────────────
ALTER TABLE snaptrade_connections
  ADD COLUMN IF NOT EXISTS status           snaptrade_connection_status NOT NULL DEFAULT 'stale',
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_error       text;

-- ── 3. Mark existing rows as stale (connected but unverified) ──────────────────
UPDATE snaptrade_connections
SET status = 'stale'
WHERE status IS DISTINCT FROM 'healthy';

-- ── 4. Function: called by edge function after a successful holdings fetch ──────
CREATE OR REPLACE FUNCTION private.mark_connection_healthy(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE snaptrade_connections
  SET
    status           = 'healthy',
    last_verified_at = now(),
    sync_error       = NULL
  WHERE user_id = p_user_id;
END;
$$;

-- ── 5. Function: called by edge function when brokerage returns 401/403 ─────────
CREATE OR REPLACE FUNCTION private.mark_connection_expired(p_user_id uuid, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE snaptrade_connections
  SET
    status     = 'expired',
    sync_error = COALESCE(p_error, 'Brokerage authorization expired')
  WHERE user_id = p_user_id;
END;
$$;

-- ── 6. Function: nightly cron — mark stale any connection not verified in 26 h ──
-- (26 h gives a 2-hour buffer over the 24-h nightly sync window)
CREATE OR REPLACE FUNCTION private.mark_stale_connections()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  rows_updated integer;
BEGIN
  UPDATE snaptrade_connections
  SET status = 'stale'
  WHERE
    status = 'healthy'
    AND (
      last_verified_at IS NULL
      OR last_verified_at < now() - interval '26 hours'
    );
  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated;
END;
$$;

-- ── 7. Schedule nightly stale-marking at 00:01 UTC (before price sync at 00:05) ─
SELECT cron.schedule(
  'mark-stale-connections',
  '1 0 * * *',
  $$ SELECT private.mark_stale_connections(); $$
);

-- ── 8. RLS: users can read their own connection status ─────────────────────────
-- (policy already exists from original migration; this just ensures the new
--  columns are visible through it — no additional policy needed)

-- ── 9. Index for efficient status lookups ──────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_snaptrade_connections_status
  ON snaptrade_connections(status)
  WHERE status IN ('expired', 'stale');

COMMENT ON COLUMN snaptrade_connections.status IS
  'Health state maintained by the edge function and nightly cron. '
  'expired = brokerage revoked auth, user must go through portal again. '
  'stale = connected but no recent successful sync.';
