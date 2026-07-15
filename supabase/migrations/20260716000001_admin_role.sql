-- =============================================================================
-- Admin observer role
--
-- Design contract (requested explicitly):
--   1. Admin bypasses route-level auth gates (handled in middleware).
--   2. Admin NEVER changes state or intervenes with other accounts.
--
-- Enforcement of (2) lives HERE, not in the UI:
--   - Admin gets SELECT-only RLS policies on advisor tables.
--   - No INSERT / UPDATE / DELETE policy mentions is_admin(), so Postgres
--     rejects any write an admin session attempts — even if the frontend
--     has a bug or the JWT is replayed against the REST API directly.
--
-- app_metadata.role = 'admin' is set exclusively via the service-role key
-- (scripts/promote-admin.mjs). Clients cannot write app_metadata.
-- =============================================================================


-- ── public.is_admin() ─────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
$$;

grant execute on function public.is_admin() to authenticated, anon;


-- ── Read-only visibility for the admin panel ──────────────────────────────────
-- SELECT-only. Deliberately no write policies: the absence is the guarantee.

create policy "advisor_firms: admin observer read"
  on public.advisor_firms for select
  using (public.is_admin());

create policy "advisor_audit_log: admin observer read"
  on public.advisor_audit_log for select
  using (public.is_admin());
