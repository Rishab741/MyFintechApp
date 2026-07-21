-- =============================================================================
-- advisor_reports.sparkline — a downsampled (~24 point) wealth-path preview,
-- stored at save time so the report gallery can render a mini chart per card
-- without pulling the full diagnostic JSONB (which can be large) into every
-- list query.
-- =============================================================================

alter table public.advisor_reports
  add column if not exists sparkline jsonb;
