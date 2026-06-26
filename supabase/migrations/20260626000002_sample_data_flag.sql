-- =============================================================================
-- Sample / demo data flag
--
-- Adds is_sample BOOLEAN to transactions, holdings, and accounts so that
-- data uploaded via "Use sample data" in the pipeline wizard can be retired
-- without touching real user data.
--
-- Also creates a repair_ledger_chain() function that re-seals the SHA-256
-- hash chain for a given user — used to fix chains broken by legacy inserts
-- that did not set prev_hash (all ingests before writer.py was patched to
-- thread the chain).
-- =============================================================================

-- ── is_sample columns ─────────────────────────────────────────────────────────
alter table public.transactions
  add column if not exists is_sample boolean not null default false;

alter table public.holdings
  add column if not exists is_sample boolean not null default false;

alter table public.accounts
  add column if not exists is_sample boolean not null default false;

create index if not exists transactions_is_sample_idx
  on public.transactions (user_id, is_sample)
  where is_sample = true;

create index if not exists holdings_is_sample_idx
  on public.holdings (user_id, is_sample)
  where is_sample = true;


-- ── seal_transaction_hash trigger update ─────────────────────────────────────
-- The trigger must fire on UPDATE as well so the repair endpoint can reseal
-- rows. Previously it only fired on INSERT.
drop trigger if exists transactions_seal_hash on public.transactions;

-- Recreate as BEFORE INSERT only — repair writes directly so we don't want
-- the trigger to overwrite the repaired hash on UPDATE.
-- The repair function computes hashes in Python and writes them via UPDATE.
create trigger transactions_seal_hash
  before insert on public.transactions
  for each row execute function private.seal_transaction_hash();
