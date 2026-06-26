-- ── Onboarding state machine ─────────────────────────────────────────────────
-- Explicit DB-level state machine for the multi-step onboarding flow.
-- States flow: PENDING_VERIFICATION → MFA_SETUP → WORKSPACE_CONFIGURED
--              → INTEGRATION_CONNECTED → COMPLETED
--
-- The middleware reads a short-lived cookie (set by /api/onboarding) so it
-- never needs a DB call for routing decisions — zero added latency.

CREATE TYPE public.onboarding_step AS ENUM (
  'PENDING_VERIFICATION',
  'MFA_SETUP',
  'WORKSPACE_CONFIGURED',
  'INTEGRATION_CONNECTED',
  'COMPLETED'
);

CREATE TABLE public.user_onboarding (
  user_id            UUID                    PRIMARY KEY
                     REFERENCES auth.users(id) ON DELETE CASCADE,
  step               public.onboarding_step  NOT NULL DEFAULT 'PENDING_VERIFICATION',
  workspace_name     TEXT,
  workspace_currency TEXT                    NOT NULL DEFAULT 'USD',
  mfa_enrolled       BOOLEAN                 NOT NULL DEFAULT FALSE,
  integration_type   TEXT,            -- 'snaptrade' | 'exchange' | 'csv' | null (skip)
  started_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- ── Row-level security ────────────────────────────────────────────────────────
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own row"
  ON public.user_onboarding FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own row"
  ON public.user_onboarding FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON public.user_onboarding
  USING (true)
  WITH CHECK (true);

-- ── Auto-update updated_at on every row change ────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_onboarding_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER onboarding_updated_at
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.set_onboarding_updated_at();

-- ── Auto-create onboarding row when a new auth user is created ────────────────
-- This fires for every signup. The API callback advances the step after
-- email verification. Existing users get no row → middleware treats absence
-- as COMPLETED and allows full dashboard access.
CREATE OR REPLACE FUNCTION public.create_user_onboarding()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_onboarding (user_id, step)
  VALUES (NEW.id, 'PENDING_VERIFICATION')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_user_onboarding();

-- ── Central audit log for onboarding events ───────────────────────────────────
-- Separate from the engine's audit_log to avoid schema coupling.
-- Writes are fire-and-forget (never block the user request).
CREATE TABLE public.onboarding_audit_log (
  id         BIGSERIAL                   PRIMARY KEY,
  user_id    UUID                        REFERENCES auth.users(id),
  event      TEXT                        NOT NULL,
  step_from  public.onboarding_step,
  step_to    public.onboarding_step,
  metadata   JSONB                       NOT NULL DEFAULT '{}',
  ip         TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

ALTER TABLE public.onboarding_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own audit"
  ON public.onboarding_audit_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role audit full access"
  ON public.onboarding_audit_log
  USING (true)
  WITH CHECK (true);

-- Fast lookup index for per-user audit queries
CREATE INDEX idx_onboarding_audit_user_id ON public.onboarding_audit_log (user_id, created_at DESC);
