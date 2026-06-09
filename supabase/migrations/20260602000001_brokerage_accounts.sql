-- =============================================================================
-- Multi-Brokerage Account Registry
--
-- Replaces the single-row snaptrade_connections model with a proper
-- multi-account, multi-provider table. Each row is one brokerage account
-- connected by a user. One user can connect Schwab, Robinhood, and Coinbase
-- simultaneously — each gets its own row here.
--
-- Provider model:
--   'snaptrade' — covers 150+ brokerages via SnapTrade's hosted portal.
--                 The user never sees OAuth — SnapTrade handles it silently.
--   'plaid'     — bank accounts, cash, credit (existing linked_accounts table)
--   'manual'    — accounts entered via CSV import (no live sync)
--
-- Multi-tenant: user_id scopes rows to the individual Supabase auth user.
-- The tenant layer (tenant_members) sits above and is enforced by the engine.
-- =============================================================================

-- ── Main accounts table ───────────────────────────────────────────────────────
create table if not exists public.brokerage_accounts (
  id                    uuid        primary key default gen_random_uuid(),
  user_id               uuid        not null references auth.users (id) on delete cascade,

  -- Provider
  provider              text        not null default 'snaptrade',
    -- 'snaptrade' | 'plaid' | 'manual'

  -- SnapTrade identifiers
  snaptrade_account_id  text,       -- SnapTrade account UUID (provider_account_id)
  snaptrade_auth_id     text,       -- brokerage_authorization_id from callback URL

  -- Institution metadata (populated from SnapTrade /brokerages or Plaid)
  brokerage_slug        text,       -- e.g. 'ROBINHOOD', 'SCHWAB', 'COINBASE'
  brokerage_name        text,       -- e.g. 'Robinhood', 'Charles Schwab'
  brokerage_logo_url    text,       -- CDN URL from SnapTrade

  -- Account details
  account_name          text,       -- e.g. 'Individual Brokerage', 'TFSA'
  account_number        text,       -- masked: '****1234'
  account_type          text,       -- 'TFSA' | 'RRSP' | 'INDIVIDUAL' | 'IRA' | 'CRYPTO'
  currency              text        not null default 'USD',

  -- Sync status
  is_active             boolean     not null default true,
  last_synced_at        timestamptz,
  sync_error            text,
  reconnect_required    boolean     not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (user_id, provider, snaptrade_account_id)
);

create index if not exists brokerage_accounts_user_idx
  on public.brokerage_accounts (user_id, is_active, created_at desc);

create index if not exists brokerage_accounts_slug_idx
  on public.brokerage_accounts (user_id, brokerage_slug);

alter table public.brokerage_accounts enable row level security;

create policy "Users manage own brokerage accounts"
  on public.brokerage_accounts
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Brokerage catalogue cache ─────────────────────────────────────────────────
-- Stores the list of brokerages SnapTrade supports so we can render the
-- discovery UI without calling SnapTrade on every page load.
-- Refreshed by a daily Edge Function cron job.
create table if not exists public.brokerage_catalogue (
  slug              text        primary key,   -- 'ROBINHOOD', 'SCHWAB', etc.
  name              text        not null,
  logo_url          text,
  url               text,
  primary_color     text,
  description       text,
  account_types     jsonb       not null default '[]',  -- ['INDIVIDUAL', 'IRA', ...]
  is_crypto         boolean     not null default false,
  is_featured       boolean     not null default false,  -- pinned at top
  display_order     integer     not null default 999,
  updated_at        timestamptz not null default now()
);

-- Featured brokerages (shown prominently regardless of search)
insert into public.brokerage_catalogue
  (slug,           name,                     is_crypto, is_featured, display_order)
values
  ('ROBINHOOD',    'Robinhood',               false,     true, 1),
  ('SCHWAB',       'Charles Schwab',          false,     true, 2),
  ('FIDELITY',     'Fidelity Investments',    false,     true, 3),
  ('ETRADE',       'E*TRADE',                 false,     true, 4),
  ('TDAMERITRADE', 'TD Ameritrade',           false,     true, 5),
  ('IBKR',         'Interactive Brokers',     false,     true, 6),
  ('WEBULL',       'Webull',                  false,     true, 7),
  ('COINBASE',     'Coinbase',                true,      true, 8),
  ('QUESTRADE',    'Questrade',               false,     true, 9),
  ('WEALTHSIMPLE', 'Wealthsimple',            false,     true, 10),
  ('ALPACA',       'Alpaca',                  false,     false, 11),
  ('VANGUARD',     'Vanguard',                false,     false, 12),
  ('MERRILLEDGE',  'Merrill Edge',            false,     false, 13),
  ('MOOMOO',       'moomoo',                  false,     false, 14),
  ('TASTYTRADE',   'tastytrade',              false,     false, 15)
on conflict (slug) do nothing;

alter table public.brokerage_catalogue enable row level security;

-- Anyone authenticated can read the catalogue (it's not sensitive)
create policy "Authenticated users read catalogue"
  on public.brokerage_catalogue for select
  using (auth.uid() is not null);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
drop trigger if exists brokerage_accounts_touch on public.brokerage_accounts;
create trigger brokerage_accounts_touch
  before update on public.brokerage_accounts
  for each row execute function private.touch_updated_at();

-- ── View: query_brokerage_summary ────────────────────────────────────────────
-- Returns one row per user showing their connection health at a glance.
-- Used by the dashboard header and onboarding checklist.
create or replace view public.query_brokerage_summary
  with (security_invoker = true)
as
select
  user_id,
  count(*)                                           as total_accounts,
  count(*) filter (where is_active and not reconnect_required) as healthy_accounts,
  count(*) filter (where reconnect_required)          as needs_reconnect,
  max(last_synced_at)                                as last_synced_at,
  array_agg(brokerage_name order by created_at)
    filter (where is_active)                          as connected_brokerages
from public.brokerage_accounts
where user_id = auth.uid()
group by user_id;
