-- =============================================================================
-- Tenant API Key Metadata
--
-- Adds tracking columns to tenants so admins can see when a key was issued
-- and clients can label their keys (e.g. 'Production', 'Staging').
-- =============================================================================

alter table public.tenants
  add column if not exists api_key_label     text,
  add column if not exists api_key_issued_at timestamptz;
