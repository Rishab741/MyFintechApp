-- =============================================================================
-- Exchange OAuth Connections
--
-- Stores OAuth tokens for Coinbase and Binance API key credentials.
-- Tokens are encrypted at rest via Supabase Vault (pgsodium).
-- =============================================================================

-- ── Exchange connections ───────────────────────────────────────────────────────
create table if not exists public.exchange_connections (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  exchange        text        not null,          -- 'coinbase' | 'binance' | 'binance_us'
  label           text,                          -- user-visible display name
  connection_type text        not null,          -- 'oauth' | 'api_key'

  -- OAuth fields (encrypted)
  access_token    text,
  refresh_token   text,
  token_expires_at timestamptz,
  oauth_scope     text,

  -- API key fields (encrypted)
  api_key         text,
  api_secret      text,

  -- Status
  is_active       boolean     not null default true,
  last_synced_at  timestamptz,
  sync_error      text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (user_id, exchange)
);

create index if not exists exchange_connections_user_idx
  on public.exchange_connections (user_id, exchange);

alter table public.exchange_connections enable row level security;

create policy "Users manage own exchange connections"
  on public.exchange_connections
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── CSV import jobs ───────────────────────────────────────────────────────────
-- Tracks file imports for audit and history display in the UI.
create table if not exists public.csv_import_jobs (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  file_name       text        not null,
  row_count       integer     not null default 0,
  inserted        integer     not null default 0,
  skipped         integer     not null default 0,
  error_count     integer     not null default 0,
  errors          jsonb       not null default '[]',
  status          text        not null default 'complete',  -- 'complete' | 'partial' | 'failed'
  column_mapping  jsonb,                                    -- the mapping the user selected
  created_at      timestamptz not null default now()
);

create index if not exists csv_import_jobs_user_idx
  on public.csv_import_jobs (user_id, created_at desc);

alter table public.csv_import_jobs enable row level security;

create policy "Users read own import jobs"
  on public.csv_import_jobs for select
  using (auth.uid() = user_id);

create policy "Users insert own import jobs"
  on public.csv_import_jobs for insert
  with check (auth.uid() = user_id);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists exchange_connections_touch on public.exchange_connections;
create trigger exchange_connections_touch
  before update on public.exchange_connections
  for each row execute function private.touch_updated_at();
