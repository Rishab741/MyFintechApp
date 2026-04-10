-- =============================================================================
-- linked_accounts: additive patch
-- The table itself was created in 20260324000000_portfolio_schema.sql.
-- This migration adds the columns and policy that were originally in the
-- misplaced src/lib/Migrations/_create_linked_accounts.sql file.
-- =============================================================================

-- ── Add missing columns (idempotent) ─────────────────────────────────────────
alter table public.linked_accounts
  add column if not exists status      text        not null default 'active',
  add column if not exists last_synced timestamptz not null default now();

-- ── Additional RLS policy (idempotent guard) ──────────────────────────────────
-- Migration 00000 already created a SELECT-only policy.
-- This adds INSERT/UPDATE/DELETE coverage for the owning user.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'linked_accounts'
      and policyname = 'Users manage own linked_accounts'
  ) then
    create policy "Users manage own linked_accounts"
      on public.linked_accounts
      for all
      using  (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
