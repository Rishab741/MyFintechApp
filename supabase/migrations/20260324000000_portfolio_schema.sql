-- SnapTrade user registry (stores the secret needed for all SnapTrade API calls)
create table if not exists public.snaptrade_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  user_secret text not null,
  created_at  timestamptz default now()
);

-- Brokerage connections (one row per connected brokerage account)
create table if not exists public.snaptrade_connections (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  account_id                  text not null,
  brokerage_authorization_id  text,
  connected_at                timestamptz default now(),
  unique(user_id)
);

-- Portfolio snapshots (time-series; each holdings fetch appends a row)
create table if not exists public.portfolio_snapshots (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  snapshot    jsonb not null,
  captured_at timestamptz not null default now()
);

create index if not exists portfolio_snapshots_user_captured
  on public.portfolio_snapshots(user_id, captured_at desc);

-- Plaid linked bank accounts
create table if not exists public.linked_accounts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  provider          text not null default 'plaid',
  access_token      text not null,
  provider_item_id  text,
  institution_name  text,
  account_type      text,
  linked_at         timestamptz default now()
);

-- ── Row Level Security ─────────────────────────────────────────────────────────
-- The edge function uses the service role key (bypasses RLS).
-- These policies protect direct client queries.

alter table public.snaptrade_users       enable row level security;
alter table public.snaptrade_connections enable row level security;
alter table public.portfolio_snapshots   enable row level security;
alter table public.linked_accounts       enable row level security;

create policy "Users read own snaptrade_users"
  on public.snaptrade_users for select
  using (auth.uid() = user_id);

create policy "Users read own snaptrade_connections"
  on public.snaptrade_connections for select
  using (auth.uid() = user_id);

create policy "Users read own portfolio_snapshots"
  on public.portfolio_snapshots for select
  using (auth.uid() = user_id);

create policy "Users read own linked_accounts"
  on public.linked_accounts for select
  using (auth.uid() = user_id);

-- ── Realtime ───────────────────────────────────────────────────────────────────
-- Enables the Portfolio.tsx realtime subscription to receive INSERT events.
alter publication supabase_realtime add table public.portfolio_snapshots;
