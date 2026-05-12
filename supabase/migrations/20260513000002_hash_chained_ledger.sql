-- =============================================================================
-- Hash-Chained Transaction Ledger
--
-- Upgrades the existing transactions table from append-only-by-convention to
-- cryptographically tamper-evident via SHA-256 hash chaining.
--
-- How it works:
--   Each transaction stores a hash of (prev_hash || key fields || tenant_id).
--   Walking the chain from any row to its predecessor lets you detect if any
--   row was modified or deleted — without a distributed blockchain.
--
-- prev_hash is set by the application (Python engine) before INSERT.
-- row_hash is computed by PostgreSQL as a GENERATED ALWAYS AS column.
--
-- The first transaction in a tenant's chain uses 'GENESIS' as prev_hash.
--
-- Verification: call verify_ledger_integrity(user_id) — returns the first
-- broken link, or NULL if the chain is intact.
-- =============================================================================

-- ── Add hash columns to transactions ─────────────────────────────────────────
alter table public.transactions
  add column if not exists prev_hash text,
  add column if not exists row_hash  text;

-- row_hash is computed from immutable fields on insert.
-- We use a trigger (not GENERATED ALWAYS AS) because GENERATED columns
-- cannot reference prev_hash of the *previous* row — that computation
-- happens in the application layer before INSERT.
-- The trigger seals the row_hash immediately after insert so it cannot
-- be set to an arbitrary value by the caller.

create or replace function private.seal_transaction_hash()
returns trigger
language plpgsql
as $$
begin
  -- Compute row_hash from the application-supplied prev_hash + key fields.
  -- Any modification to id, net_amount, settled_at, or user_id breaks the chain.
  new.row_hash := encode(
    sha256((
      coalesce(new.prev_hash, 'GENESIS') ||
      new.id::text                       ||
      new.net_amount::text               ||
      new.settled_at::text               ||
      new.user_id::text                  ||
      coalesce(new.symbol, '')           ||
      new.transaction_type
    )::bytea),
    'hex'
  );
  return new;
end;
$$;

drop trigger if exists transactions_seal_hash on public.transactions;
create trigger transactions_seal_hash
  before insert on public.transactions
  for each row execute function private.seal_transaction_hash();


-- ── Ledger checkpoints ────────────────────────────────────────────────────────
-- Every 1,000 transactions the Python engine writes a Merkle root checkpoint.
-- These checkpoints are the anchoring points for integrity verification —
-- verifying a 100k-row chain from scratch is O(n); verifying from the nearest
-- checkpoint is O(1000) worst case.
create table if not exists public.ledger_checkpoints (
  id             bigserial   primary key,
  user_id        uuid        not null references auth.users (id) on delete cascade,
  tx_sequence_lo bigint      not null,   -- first tx.id (numeric cast) in this batch
  tx_sequence_hi bigint      not null,   -- last tx.id in this batch
  tx_count       integer     not null,
  merkle_root    text        not null,   -- SHA-256 of all row_hashes in the batch
  created_at     timestamptz not null default now()
);

create index if not exists ledger_checkpoints_user_id_idx
  on public.ledger_checkpoints (user_id, created_at desc);

alter table public.ledger_checkpoints enable row level security;

create policy "Users read own ledger checkpoints"
  on public.ledger_checkpoints for select
  using (auth.uid() = user_id);


-- ── FUNCTION: verify_ledger_integrity(user_id) ───────────────────────────────
-- Walks the chain for a user and returns the first broken link.
-- Returns NULL if the chain is intact (all hashes verify correctly).
--
-- A broken link means either:
--   a) a row's row_hash doesn't match the expected hash of its fields, OR
--   b) a row's prev_hash doesn't match the preceding row's row_hash
--
-- Usage:
--   SELECT * FROM verify_ledger_integrity('user-uuid-here');
create or replace function public.verify_ledger_integrity(p_user_id uuid)
returns table (
  broken_tx_id   uuid,
  broken_at      timestamptz,
  issue          text
)
language plpgsql
security definer
as $$
declare
  rec          record;
  prev_stored  text := 'GENESIS';
  expected_hash text;
begin
  for rec in
    select id, prev_hash, row_hash, net_amount, settled_at, user_id, symbol, transaction_type
    from public.transactions
    where user_id = p_user_id
    order by settled_at asc, created_at asc
  loop
    -- 1. Check prev_hash linkage
    if coalesce(rec.prev_hash, 'GENESIS') <> prev_stored then
      broken_tx_id := rec.id;
      broken_at    := rec.settled_at;
      issue        := 'prev_hash mismatch: chain broken before this transaction';
      return next;
      return;
    end if;

    -- 2. Recompute row_hash and compare
    expected_hash := encode(
      sha256((
        coalesce(rec.prev_hash, 'GENESIS') ||
        rec.id::text                       ||
        rec.net_amount::text               ||
        rec.settled_at::text               ||
        rec.user_id::text                  ||
        coalesce(rec.symbol, '')           ||
        rec.transaction_type
      )::bytea),
      'hex'
    );

    if rec.row_hash is null or rec.row_hash <> expected_hash then
      broken_tx_id := rec.id;
      broken_at    := rec.settled_at;
      issue        := 'row_hash mismatch: transaction data may have been tampered with';
      return next;
      return;
    end if;

    prev_stored := rec.row_hash;
  end loop;

  -- Chain intact — return no rows
  return;
end;
$$;


-- ── FUNCTION: get_chain_tip(user_id) ─────────────────────────────────────────
-- Returns the row_hash of the most recent transaction for a user.
-- The Python engine calls this before INSERT to get the correct prev_hash.
create or replace function public.get_chain_tip(p_user_id uuid)
returns text
language sql
security definer
stable
as $$
  select row_hash
  from public.transactions
  where user_id = p_user_id
    and row_hash is not null
  order by settled_at desc, created_at desc
  limit 1;
$$;


-- ── Backfill row_hash for existing transactions ───────────────────────────────
-- Existing rows have no prev_hash (they predate the chain). We backfill
-- row_hash using 'GENESIS' as prev_hash for all existing rows so verification
-- functions don't trip on NULLs. Chain integrity for new inserts begins after
-- this migration.
do $$
declare
  rec record;
begin
  for rec in
    select id, net_amount, settled_at, user_id, symbol, transaction_type
    from public.transactions
    where row_hash is null
    order by settled_at asc, created_at asc
  loop
    update public.transactions
    set
      prev_hash = 'GENESIS',
      row_hash  = encode(
        sha256((
          'GENESIS'             ||
          rec.id::text          ||
          rec.net_amount::text  ||
          rec.settled_at::text  ||
          rec.user_id::text     ||
          coalesce(rec.symbol, '') ||
          rec.transaction_type
        )::bytea),
        'hex'
      )
    where id = rec.id;
  end loop;
end $$;
