-- =============================================================================
-- Phase 1 — Data Normaliser
--
-- Extracts structured data from the existing portfolio_snapshots JSONB blobs
-- and populates the new normalised tables:
--   assets               ← unique tickers seen across all snapshots
--   holdings             ← positions from the most recent snapshot per user
--   portfolio_snapshots_v2 ← one NAV row per historical JSONB snapshot
--
-- The SnapTrade API returns symbol in two formats:
--   1. Plain string:  "AAPL"
--   2. Object:        { "raw_symbol": "AAPL", "symbol": { ... }, "id": "..." }
-- This mirrors the getTicker() logic in src/portfolio/helpers.ts.
--
-- USAGE
--   Called automatically at the end of this migration (backfill on deploy).
--   Re-entrant: all UPSERTs use ON CONFLICT DO NOTHING or DO UPDATE.
--   Can be re-run at any time without side effects:
--     select private.normalise_snapshots();         -- all users
--     select private.normalise_snapshots('uuid');   -- single user
--
-- CRON
--   A pg_cron job runs this nightly so any new JSONB snapshots (written by
--   the legacy code path during the Phase 2 transition) are also normalised.
-- =============================================================================

-- =============================================================================
-- FUNCTION: private.extract_ticker
-- Mirrors src/portfolio/helpers.ts :: getTicker()
-- Handles both plain-string and nested-object symbol formats from SnapTrade.
-- =============================================================================
create or replace function private.extract_ticker(symbol jsonb)
returns text
language plpgsql immutable
as $$
declare
  v_ticker text;
begin
  if symbol is null or symbol = 'null'::jsonb then
    return '???';
  end if;

  -- Case 1: plain string — "AAPL"
  if jsonb_typeof(symbol) = 'string' then
    v_ticker := symbol #>> '{}';
    if length(v_ticker) >= 1 then return upper(trim(v_ticker)); end if;
  end if;

  -- Case 2: object with raw_symbol — {"raw_symbol": "AAPL", ...}
  if jsonb_typeof(symbol) = 'object' then
    v_ticker := symbol ->> 'raw_symbol';
    if v_ticker is not null and v_ticker <> '' then
      return upper(trim(v_ticker));
    end if;

    -- Nested symbol object — {"symbol": {"raw_symbol": "AAPL"}}
    if symbol -> 'symbol' is not null then
      return private.extract_ticker(symbol -> 'symbol');
    end if;

    -- Fallback to id
    v_ticker := symbol ->> 'id';
    if v_ticker is not null and v_ticker <> '' then
      return upper(trim(v_ticker));
    end if;
  end if;

  return 'UNKNOWN';
end;
$$;

-- =============================================================================
-- FUNCTION: private.classify_asset
-- Mirrors src/portfolio/helpers.ts :: getCategory()
-- Returns the asset_class for a given ticker symbol.
-- =============================================================================
create or replace function private.classify_asset(p_ticker text)
returns text
language sql immutable
as $$
  select case
    when upper(p_ticker) = any(array[
      'BTC','ETH','SOL','BNB','ADA','XRP','DOGE','DOT','MATIC','AVAX',
      'USDT','USDC','LTC','LINK','UNI','ATOM','FTM','ALGO','SHIB','CRO',
      'NEAR','ICP','FIL','VET','HBAR','CAKE','AAVE','COMP','MKR','YFI',
      'CRV','TRX'
    ])                       then 'crypto'
    when upper(p_ticker) = any(array[
      'SPY','QQQ','IWM','VTI','VOO','GLD','SLV','XLK','XLF','XLE','ARKK',
      'DIA','EEM','VEA','XLV','XLI','XLY','XLP','XLRE','XLB','XLU','XLC'
    ])                       then 'etf'
    else                          'equity'
  end;
$$;

-- =============================================================================
-- FUNCTION: private.normalise_snapshots
-- Main normalisation routine.  Processes all historical portfolio_snapshots
-- rows for the given user (or all users if p_user_id is null).
-- =============================================================================
create or replace function private.normalise_snapshots(p_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_snap            record;
  v_pos             record;
  v_ticker          text;
  v_asset_class     text;
  v_asset_id        uuid;
  v_account_id      uuid;
  v_total_value     numeric(20,8);
  v_cash_value      numeric(20,8);
  v_invested_value  numeric(20,8);

  -- Counters for the return summary
  v_snapshots_processed integer := 0;
  v_assets_created      integer := 0;
  v_holdings_upserted   integer := 0;
  v_nav_rows_created    integer := 0;
begin
  -- ── Iterate every relevant portfolio_snapshots row ──────────────────────────
  for v_snap in
    select
      ps.id,
      ps.user_id,
      ps.snapshot,
      ps.captured_at
    from public.portfolio_snapshots ps
    where (p_user_id is null or ps.user_id = p_user_id)
      and ps.snapshot is not null
    order by ps.user_id, ps.captured_at asc
  loop

    -- Resolve the accounts.id for this user's SnapTrade connection.
    -- Prefer the accounts table (new); fall back to snaptrade_connections.
    select a.id into v_account_id
    from public.accounts a
    where a.user_id  = v_snap.user_id
      and a.provider = 'snaptrade'
      and a.is_active
    limit 1;

    if v_account_id is null then
      -- No account record yet — create a stub so holdings can reference it
      insert into public.accounts (user_id, provider, account_type, is_active)
      values (v_snap.user_id, 'snaptrade', 'brokerage', true)
      on conflict do nothing
      returning id into v_account_id;

      -- If another session inserted it concurrently
      if v_account_id is null then
        select id into v_account_id
        from public.accounts
        where user_id = v_snap.user_id and provider = 'snaptrade'
        limit 1;
      end if;
    end if;

    -- ── Compute NAV components from this snapshot ──────────────────────────────
    v_cash_value := coalesce(
      (
        select sum(coalesce((b ->> 'cash')::numeric, 0))
        from jsonb_array_elements(coalesce(v_snap.snapshot -> 'balances', '[]'::jsonb)) b
      ),
      0
    );

    v_invested_value := coalesce(
      (
        select sum(
          coalesce((p ->> 'units')::numeric, (p ->> 'quantity')::numeric, 0)
          * coalesce((p ->> 'price')::numeric, 0)
        )
        from jsonb_array_elements(coalesce(v_snap.snapshot -> 'positions', '[]'::jsonb)) p
      ),
      0
    );

    v_total_value := v_cash_value + v_invested_value;

    -- ── Insert into portfolio_snapshots_v2 ─────────────────────────────────────
    insert into public.portfolio_snapshots_v2 (
      time, user_id, account_id,
      total_value, cash_value, invested_value,
      currency
    )
    values (
      v_snap.captured_at,
      v_snap.user_id,
      v_account_id,
      v_total_value,
      v_cash_value,
      v_invested_value,
      'USD'          -- currency normalisation happens in Phase 2
    )
    on conflict (time, user_id) do update
      set total_value    = excluded.total_value,
          cash_value     = excluded.cash_value,
          invested_value = excluded.invested_value,
          account_id     = excluded.account_id;

    v_nav_rows_created := v_nav_rows_created + 1;

    -- ── Process positions (only on the latest snapshot per user) ──────────────
    -- Holdings reflect *current* state; we only populate from the most recent
    -- snapshot.  Earlier snapshots only feed portfolio_snapshots_v2.
    if v_snap.captured_at = (
      select max(ps2.captured_at)
      from public.portfolio_snapshots ps2
      where ps2.user_id = v_snap.user_id
    ) then

      for v_pos in
        select value as pos
        from jsonb_array_elements(
          coalesce(v_snap.snapshot -> 'positions', '[]'::jsonb)
        )
      loop
        -- Extract ticker
        v_ticker := private.extract_ticker(v_pos.pos -> 'symbol');
        if v_ticker is null or v_ticker in ('???', 'UNKNOWN', '') then
          continue;
        end if;

        -- Classify asset
        v_asset_class := private.classify_asset(v_ticker);

        -- Upsert asset record
        insert into public.assets (symbol, asset_class, name, currency)
        values (
          v_ticker,
          v_asset_class,
          coalesce(
            v_pos.pos ->> 'description',
            v_ticker
          ),
          coalesce(
            (
              -- currency can be a string or {"code":"USD","id":"USD"}
              case jsonb_typeof(v_pos.pos -> 'currency')
                when 'string' then v_pos.pos ->> 'currency'
                when 'object' then coalesce(
                  v_pos.pos -> 'currency' ->> 'code',
                  v_pos.pos -> 'currency' ->> 'id',
                  'USD'
                )
                else 'USD'
              end
            ),
            'USD'
          )
        )
        on conflict (symbol, exchange) do update
          set asset_class = excluded.asset_class,
              updated_at  = now()
        returning id into v_asset_id;

        -- Handle the case where ON CONFLICT did not return (existing row)
        if v_asset_id is null then
          select id into v_asset_id
          from public.assets
          where symbol   = v_ticker
            and exchange is null
          limit 1;
        end if;

        if v_asset_id is null then
          continue; -- should not happen, but guard against it
        end if;

        -- Upsert holding
        insert into public.holdings (
          user_id, account_id, asset_id, symbol,
          quantity, currency,
          last_price, last_price_at,
          open_pnl,
          updated_at
        )
        values (
          v_snap.user_id,
          v_account_id,
          v_asset_id,
          v_ticker,
          coalesce(
            (v_pos.pos ->> 'units')::numeric,
            (v_pos.pos ->> 'quantity')::numeric,
            0
          ),
          coalesce(
            case jsonb_typeof(v_pos.pos -> 'currency')
              when 'string' then v_pos.pos ->> 'currency'
              when 'object' then coalesce(
                v_pos.pos -> 'currency' ->> 'code',
                v_pos.pos -> 'currency' ->> 'id',
                'USD'
              )
              else 'USD'
            end,
            'USD'
          ),
          (v_pos.pos ->> 'price')::numeric,
          v_snap.captured_at,
          (v_pos.pos ->> 'open_pnl')::numeric,
          v_snap.captured_at
        )
        on conflict (account_id, asset_id) do update
          set quantity       = excluded.quantity,
              last_price     = excluded.last_price,
              last_price_at  = excluded.last_price_at,
              open_pnl       = excluded.open_pnl,
              updated_at     = excluded.updated_at;

        v_holdings_upserted := v_holdings_upserted + 1;
      end loop;

    end if; -- end of latest-snapshot branch

    v_snapshots_processed := v_snapshots_processed + 1;

  end loop;

  return jsonb_build_object(
    'snapshots_processed',  v_snapshots_processed,
    'assets_created',       v_assets_created,
    'holdings_upserted',    v_holdings_upserted,
    'nav_rows_created',     v_nav_rows_created,
    'completed_at',         now()
  );
end;
$$;

-- =============================================================================
-- TRIGGER: keep holdings in sync whenever a new portfolio_snapshot is inserted
-- This bridges the legacy JSONB path (still used by the Expo app) with the
-- new normalised model during the Phase 2 transition window.
-- =============================================================================
create or replace function private.on_snapshot_normalise()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Run the normaliser for just this user's new snapshot
  perform private.normalise_snapshots(new.user_id);
  return new;
end;
$$;

drop trigger if exists normalise_on_snapshot_insert on public.portfolio_snapshots;

create trigger normalise_on_snapshot_insert
  after insert on public.portfolio_snapshots
  for each row
  execute function private.on_snapshot_normalise();

-- =============================================================================
-- CRON: nightly normalisation sweep at 03:00 UTC
-- Catches any snapshots that the trigger missed (e.g. bulk imports, restores).
-- =============================================================================
select cron.unschedule('normalise-snapshots-nightly')
where exists (
  select 1 from cron.job where jobname = 'normalise-snapshots-nightly'
);

select cron.schedule(
  'normalise-snapshots-nightly',
  '0 3 * * *',
  $cron$
    select private.normalise_snapshots();
  $cron$
);

-- =============================================================================
-- BACKFILL: run immediately on migration deploy
-- Normalises all existing portfolio_snapshots into the new tables.
-- The DO block means any failure is logged but does not roll back the migration.
-- =============================================================================
do $$
declare
  v_result jsonb;
begin
  v_result := private.normalise_snapshots();
  raise notice 'Data normaliser completed: %', v_result;
exception when others then
  raise warning 'Data normaliser encountered an error (non-fatal): %', sqlerrm;
end $$;
