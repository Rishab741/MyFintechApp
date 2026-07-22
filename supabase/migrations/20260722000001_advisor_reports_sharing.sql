-- =============================================================================
-- Client-facing share links + a frozen prospect snapshot.
--
-- Two things this migration enables:
--
--   1. prospect_snapshot / report_template_version — the report an advisor's
--      client actually sees is computed ONCE, at save time, and frozen. This
--      is a compliance-integrity guarantee: if the app's rendering logic
--      changes later (e.g. which insights get surfaced), a previously shared
--      link keeps showing EXACTLY what was originally shared, forever. The
--      live `diagnostic` JSONB stays the advisor's full internal record;
--      prospect_snapshot is the deliberately-narrower public artifact derived
--      from it once and never recomputed.
--
--   2. share_token / share_* — a public, unauthenticated, revocable,
--      optionally-expiring link. No RLS policy grants anon SELECT on this
--      table for this purpose — the public /api/share/[token] route reads
--      via the service-role client and hand-picks which columns it returns,
--      which is a narrower and safer surface than an anon RLS policy would be.
-- =============================================================================

alter table public.advisor_reports
  add column if not exists prospect_snapshot      jsonb,
  add column if not exists report_template_version text not null default 'v1',
  add column if not exists share_token             text unique,
  add column if not exists share_created_at        timestamptz,
  add column if not exists share_expires_at        timestamptz,
  add column if not exists share_revoked_at        timestamptz,
  add column if not exists share_view_count        integer not null default 0,
  add column if not exists share_last_viewed_at     timestamptz;

create index if not exists advisor_reports_share_token_idx
  on public.advisor_reports (share_token)
  where share_token is not null;
