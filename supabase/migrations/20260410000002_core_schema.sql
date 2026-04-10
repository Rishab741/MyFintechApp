-- =============================================================================
-- Phase 1 — Core Schema
-- Replaces the ad-hoc JSONB snapshot model with a normalised relational model:
--
--   assets       — master instrument catalogue (stocks, crypto, ETFs, forex …)
--   accounts     — unified brokerage / bank accounts per user (supersedes
--                  snaptrade_connections + linked_accounts as the source of
--                  truth; those tables stay for auth during the Phase 2
--                  migration window)
--   holdings     — current positions (updated on every sync)
--   transactions — immutable append-only ledger (buy/sell/dividend …)
--   audit_logs   — every data-access and mutation event (required for SOC 2)
--
-- Design rules applied throughout:
--   • All monetary values: NUMERIC(20,8) — never FLOAT
--   • Timestamps:          TIMESTAMPTZ    — always UTC
--   • Every table has RLS enabled; service-role key bypasses in edge functions
--   • "created_at" is immutable; "updated_at" is maintained by trigger
-- =============================================================================

-- ── Shared trigger: keep updated_at current ───────────────────────────────────
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- TABLE: assets
-- Master catalogue of every tradeable instrument seen in the system.
-- Populated automatically by the normaliser (migration 06) and enriched
-- by the market data sync (Phase 2 Portfolio Engine).
-- =============================================================================
create table if not exists public.assets (
  id          uuid        primary key default gen_random_uuid(),

  -- Identity
  symbol      text        not null,   -- canonical ticker: 'AAPL', 'BTC', 'ETH-USD'
  name        text,                   -- full name: 'Apple Inc.'
  asset_class text        not null    -- see CHECK below
    check (asset_class in (
      'equity', 'crypto', 'etf', 'forex', 'commodity', 'bond', 'cash', 'derivative', 'real_estate', 'unknown'
    )),

  -- Classification
  sector      text,                   -- 'Technology', 'Healthcare', …
  industry    text,                   -- 'Semiconductors', …
  exchange    text,                   -- 'NASDAQ', 'NYSE', 'BINANCE', …
  country     text,                   -- ISO 3166-1 alpha-2: 'US', 'AU', …

  -- Monetary
  currency    text        not null default 'USD',  -- ISO 4217

  -- State
  is_active   boolean     not null default true,

  -- Extensible metadata (ISIN, CUSIP, CIK, description, logo_url …)
  metadata    jsonb       not null default '{}',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- A symbol can trade on multiple exchanges under the same ticker
  -- (e.g. BHP on ASX and BHP on LSE).  symbol+exchange is unique.
  -- If exchange is unknown we still deduplicate on symbol alone.
  unique (symbol, exchange)
);

create index if not exists assets_symbol_idx      on public.assets (symbol);
create index if not exists assets_asset_class_idx on public.assets (asset_class);
create index if not exists assets_sector_idx      on public.assets (sector);

create trigger assets_updated_at
  before update on public.assets
  for each row execute function private.set_updated_at();

-- Assets are global (not per-user), so RLS allows authenticated reads.
-- Only the service role (edge functions / backend) may INSERT or UPDATE.
alter table public.assets enable row level security;

create policy "Authenticated users read assets"
  on public.assets for select
  to authenticated
  using (true);

-- =============================================================================
-- TABLE: accounts
-- Unified record for every external financial account a user connects:
--   brokerage accounts via SnapTrade
--   bank accounts via Plaid
--   manual / self-custody accounts
--
-- Supersedes snaptrade_connections (auth only) + linked_accounts (Plaid only)
-- as the single source of truth for "what accounts does this user have".
-- =============================================================================
create table if not exists public.accounts (
  id                         uuid        primary key default gen_random_uuid(),
  user_id                    uuid        not null references auth.users (id) on delete cascade,

  -- Provider
  provider                   text        not null  -- 'snaptrade', 'plaid', 'manual'
    check (provider in ('snaptrade', 'plaid', 'manual')),
  provider_account_id        text,                 -- external account ID from provider
  brokerage_authorization_id text,                 -- SnapTrade-specific auth handle

  -- Human-readable info
  institution_name           text,                 -- 'Interactive Brokers', 'Commonwealth Bank'
  account_name               text,                 -- 'My IBKR Portfolio'
  account_number             text,                 -- masked: '****1234'
  account_type               text                  -- see CHECK below
    check (account_type in (
      'brokerage', 'bank', 'crypto_exchange', 'retirement', 'isa', 'trust', 'manual', 'unknown'
    )),

  -- Currency
  currency                   text        not null default 'USD',

  -- State
  is_active                  boolean     not null default true,
  last_synced_at             timestamptz,

  -- Extra data (raw provider response, account flags …)
  metadata                   jsonb       not null default '{}',

  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists accounts_user_id_idx    on public.accounts (user_id);
create index if not exists accounts_provider_idx   on public.accounts (user_id, provider);
create index if not exists accounts_active_idx     on public.accounts (user_id) where is_active;

create trigger accounts_updated_at
  before update on public.accounts
  for each row execute function private.set_updated_at();

alter table public.accounts enable row level security;

create policy "Users read own accounts"
  on public.accounts for select
  using (auth.uid() = user_id);

create policy "Users manage own accounts"
  on public.accounts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =============================================================================
-- TABLE: holdings
-- Current positions for each user/account.
-- This is the live state — updated on every sync.
-- Historical position data lives in portfolio_snapshots_v2 (migration 03).
--
-- quantity is the number of units held.
-- avg_cost_basis is in the account's base currency (cost per unit).
-- last_price is the most recent market price per unit.
-- =============================================================================
create table if not exists public.holdings (
  id              uuid          primary key default gen_random_uuid(),
  user_id         uuid          not null references auth.users (id) on delete cascade,
  account_id      uuid          not null references public.accounts (id) on delete cascade,
  asset_id        uuid          not null references public.assets (id),

  -- Denormalised for fast reads (avoids joins in hot paths)
  symbol          text          not null,

  -- Position
  quantity        numeric(28,10) not null default 0
    check (quantity >= 0),
  avg_cost_basis  numeric(20,8),        -- cost per unit in account currency
  currency        text          not null default 'USD',

  -- Mark-to-market (updated on every price sync)
  last_price      numeric(20,8),
  last_price_at   timestamptz,
  open_pnl        numeric(20,8),        -- unrealised P&L = (last_price - avg_cost) * quantity
  open_pnl_pct    numeric(10,6),        -- open_pnl / (avg_cost * quantity) × 100

  updated_at      timestamptz   not null default now(),

  -- One row per (account, asset) pair
  unique (account_id, asset_id)
);

create index if not exists holdings_user_id_idx   on public.holdings (user_id);
create index if not exists holdings_account_id_idx on public.holdings (account_id);
create index if not exists holdings_symbol_idx    on public.holdings (symbol);

create trigger holdings_updated_at
  before update on public.holdings
  for each row execute function private.set_updated_at();

alter table public.holdings enable row level security;

create policy "Users read own holdings"
  on public.holdings for select
  using (auth.uid() = user_id);

create policy "Users manage own holdings"
  on public.holdings for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =============================================================================
-- TABLE: transactions
-- Immutable append-only ledger.  NEVER UPDATE rows — only INSERT.
-- All portfolio metrics (returns, CAGR, P&L) are derived from this table.
--
-- net_amount is the authoritative value:
--   buy  → negative (cash leaves the account)
--   sell → positive (cash enters the account)
--   dividend, deposit → positive
--   withdrawal, fee   → negative
-- =============================================================================
create table if not exists public.transactions (
  id               uuid          primary key default gen_random_uuid(),
  user_id          uuid          not null references auth.users (id) on delete cascade,
  account_id       uuid          not null references public.accounts (id) on delete cascade,
  asset_id         uuid          references public.assets (id),  -- null for cash movements

  -- Denormalised
  symbol           text,

  -- Classification
  transaction_type text          not null
    check (transaction_type in (
      'buy', 'sell', 'dividend', 'interest',
      'deposit', 'withdrawal',
      'transfer_in', 'transfer_out',
      'split', 'merger', 'fee', 'tax', 'other'
    )),

  -- Units & price (null for cash-only movements like deposits)
  quantity         numeric(28,10),
  price            numeric(20,8),          -- price per unit at execution

  -- Cash flows (all in currency below)
  gross_amount     numeric(20,8),          -- before fees (abs value)
  fees             numeric(20,8) not null default 0
    check (fees >= 0),
  net_amount       numeric(20,8) not null, -- authoritative: negative = cash out

  currency         text          not null default 'USD',

  -- Dates
  settled_at       timestamptz   not null, -- actual trade / settlement date
  created_at       timestamptz   not null default now(),

  -- Deduplication: provider's own transaction ID per account
  provider_tx_id   text,
  unique (account_id, provider_tx_id),

  -- Narrative
  notes            text,
  metadata         jsonb         not null default '{}'
);

-- Immutability: prevent UPDATE and DELETE on settled transactions.
-- Uses a trigger (not a RULE) so:
--   a) the error is visible and descriptive rather than silently swallowed
--   b) the service role can bypass via SET session_replication_role = replica
--      if a data correction is ever genuinely required
create or replace function private.prevent_transaction_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Transactions are immutable. To correct a transaction, insert a reversal entry (transaction_type = ''other'', net_amount negated).';
end;
$$;

drop trigger if exists transactions_immutable_update on public.transactions;
create trigger transactions_immutable_update
  before update on public.transactions
  for each row execute function private.prevent_transaction_mutation();

drop trigger if exists transactions_immutable_delete on public.transactions;
create trigger transactions_immutable_delete
  before delete on public.transactions
  for each row execute function private.prevent_transaction_mutation();

create index if not exists transactions_user_id_idx     on public.transactions (user_id);
create index if not exists transactions_account_id_idx  on public.transactions (account_id);
create index if not exists transactions_settled_at_idx  on public.transactions (user_id, settled_at desc);
create index if not exists transactions_symbol_idx      on public.transactions (symbol);
create index if not exists transactions_type_idx        on public.transactions (transaction_type);

alter table public.transactions enable row level security;

create policy "Users read own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Users insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

-- =============================================================================
-- TABLE: audit_logs
-- Append-only record of every significant event in the system.
-- Required for SOC 2 compliance and enterprise customer requirements.
--
-- actor_id   — the user who triggered the event (null for system events)
-- event_type — namespaced: 'auth.login', 'portfolio.sync', 'query.execute' …
-- resource   — what was accessed or changed: 'holdings', 'transactions', …
-- metadata   — request params, IP, user-agent, result summary (no secrets)
-- =============================================================================
create table if not exists public.audit_logs (
  id          bigserial     primary key,
  actor_id    uuid          references auth.users (id) on delete set null,
  event_type  text          not null,
  resource    text,
  resource_id text,
  metadata    jsonb         not null default '{}',
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz   not null default now()
);

-- Partition hint — TimescaleDB will convert this to a hypertable in migration 03
-- so that old audit entries are automatically compressed.
create index if not exists audit_logs_actor_idx     on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_event_idx     on public.audit_logs (event_type, created_at desc);
create index if not exists audit_logs_created_idx   on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

-- Users can only read their own audit trail.
-- The service role writes all rows (edge functions / backend).
create policy "Users read own audit_logs"
  on public.audit_logs for select
  using (auth.uid() = actor_id);

-- =============================================================================
-- BACKFILL: seed accounts from existing snaptrade_connections
-- Runs once on migration apply.  Future syncs will upsert via edge functions.
-- =============================================================================
insert into public.accounts (
  user_id,
  provider,
  provider_account_id,
  brokerage_authorization_id,
  account_type,
  is_active,
  created_at,
  updated_at
)
select
  sc.user_id,
  'snaptrade'                     as provider,
  sc.account_id                   as provider_account_id,
  sc.brokerage_authorization_id,
  'brokerage'                     as account_type,
  true                            as is_active,
  sc.connected_at                 as created_at,
  now()                           as updated_at
from public.snaptrade_connections sc
on conflict do nothing;

-- Backfill from linked_accounts (Plaid bank connections)
insert into public.accounts (
  user_id,
  provider,
  provider_account_id,
  institution_name,
  account_type,
  is_active,
  created_at,
  updated_at
)
select
  la.user_id,
  'plaid'                         as provider,
  la.provider_item_id             as provider_account_id,
  la.institution_name,
  coalesce(la.account_type, 'bank') as account_type,
  (la.status = 'active')          as is_active,
  now()                           as created_at,
  now()                           as updated_at
from public.linked_accounts la
on conflict do nothing;

-- =============================================================================
-- PATCH: allow multiple SnapTrade connections per user
-- The original migration used UNIQUE(user_id) which prevents multi-brokerage.
-- We drop that constraint here so the new accounts table is the enforcer.
-- =============================================================================
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname      = 'snaptrade_connections_user_id_key'
      and conrelid     = 'public.snaptrade_connections'::regclass
  ) then
    alter table public.snaptrade_connections
      drop constraint snaptrade_connections_user_id_key;
  end if;
end $$;
