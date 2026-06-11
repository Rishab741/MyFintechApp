-- =============================================================================
-- Manual Portfolio Positions
--
-- Users can build their portfolio without connecting a brokerage by typing
-- in their holdings directly. Each row is one position (one ticker).
-- Live prices are fetched from the Railway engine / Yahoo Finance.
-- =============================================================================

create table if not exists public.user_positions (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references auth.users (id) on delete cascade,
  symbol      text          not null,
  name        text,
  quantity    numeric(20,8) not null default 0,
  avg_cost    numeric(20,8),           -- optional cost basis per share/unit
  asset_class text          not null default 'stock',
    -- 'stock' | 'etf' | 'crypto' | 'fund' | 'other'
  notes       text,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),

  unique (user_id, symbol)
);

create index if not exists user_positions_user_idx
  on public.user_positions (user_id, created_at desc);

alter table public.user_positions enable row level security;

create policy "Users manage own positions"
  on public.user_positions
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists user_positions_touch on public.user_positions;
create trigger user_positions_touch
  before update on public.user_positions
  for each row execute function private.touch_updated_at();
