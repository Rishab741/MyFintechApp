-- =============================================================================
-- ML Pipeline Automation
-- Triggers dataset regeneration automatically via two mechanisms:
--   1. DB TRIGGER  — fires every time a new portfolio_snapshot is inserted
--   2. PG_CRON     — runs a daily full-refresh at 02:00 UTC for all users
--
-- ┌─ ONE-TIME SETUP (run ONCE in Supabase SQL editor after deploying) ──────────┐
-- │                                                                              │
-- │  SELECT vault.create_secret(                                                 │
-- │    'YOUR-NEW-SERVICE-ROLE-KEY',   -- paste your (rotated) key here          │
-- │    'ml_service_role_key'          -- name used by the trigger function       │
-- │  );                                                                          │
-- │                                                                              │
-- │  Find the key: Supabase Dashboard → Settings → API → service_role           │
-- └──────────────────────────────────────────────────────────────────────────────┘
-- =============================================================================

-- ── Extensions ────────────────────────────────────────────────────────────────
-- pg_net lives in its own "net" schema in Supabase — do NOT use "with schema"
create extension if not exists pg_net;

-- pg_cron also manages its own schema
create extension if not exists pg_cron;

-- supabase_vault is enabled by default on all Supabase projects
create extension if not exists supabase_vault;

-- ── Private schema for internal functions ─────────────────────────────────────
create schema if not exists private;

-- =============================================================================
-- FUNCTION: private.call_ml_pipeline_for_user
-- Fires an async HTTP POST to the ml-pipeline edge function for one user.
-- Uses net.http_post (pg_net) so the call is non-blocking — the INSERT
-- transaction completes immediately while the HTTP request runs in the background.
--
-- The project URL is hardcoded (not a secret).
-- The service_role key is read from Supabase Vault (secret name: ml_service_role_key).
-- =============================================================================
create or replace function private.call_ml_pipeline_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_url        constant text := 'https://dukqphhcjdvxxobclahw.supabase.co';
  v_key        text;
  v_request_id bigint;
begin
  -- Read service role key from Vault (set up via one-time SQL above)
  select decrypted_secret
  into   v_key
  from   vault.decrypted_secrets
  where  name = 'ml_service_role_key'
  limit  1;

  if v_key is null then
    raise warning
      'ML pipeline: vault secret "ml_service_role_key" not found. '
      'Run: SELECT vault.create_secret(''YOUR-SERVICE-ROLE-KEY'', ''ml_service_role_key'');';
    return;
  end if;

  -- net.http_post is the correct pg_net function (schema = net, not extensions)
  select net.http_post(
    url     := v_url || '/functions/v1/ml-pipeline',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'action',  'generate_dataset',
      'user_id', p_user_id::text
    )
  ) into v_request_id;

  raise log 'ML pipeline triggered: user=%, pg_net request_id=%', p_user_id, v_request_id;

exception when others then
  -- Never crash the main INSERT transaction due to a background side-effect
  raise warning 'ML pipeline trigger failed for user %: %', p_user_id, sqlerrm;
end;
$$;

-- =============================================================================
-- TRIGGER FUNCTION: fires after every portfolio_snapshots INSERT
-- =============================================================================
create or replace function private.on_portfolio_snapshot_insert()
returns trigger
language plpgsql
security definer
as $$
begin
  perform private.call_ml_pipeline_for_user(new.user_id);
  return new;
end;
$$;

drop trigger if exists ml_pipeline_snapshot_trigger on public.portfolio_snapshots;

create trigger ml_pipeline_snapshot_trigger
  after insert on public.portfolio_snapshots
  for each row
  execute function private.on_portfolio_snapshot_insert();

-- =============================================================================
-- PG_CRON: daily full-refresh at 02:00 UTC
-- Regenerates datasets for every user who has a snaptrade connection.
-- =============================================================================
select cron.unschedule('ml-daily-dataset-refresh')
where exists (
  select 1 from cron.job where jobname = 'ml-daily-dataset-refresh'
);

select cron.schedule(
  'ml-daily-dataset-refresh',
  '0 2 * * *',
  $cron$
    select private.call_ml_pipeline_for_user(sc.user_id)
    from (
      select distinct user_id
      from   public.snaptrade_connections
    ) sc;
  $cron$
);

-- =============================================================================
-- HELPER VIEW: omitted — net._http_response schema varies by pg_net version.
-- To monitor requests manually, run in Supabase SQL editor:
--   SELECT * FROM net.http_request_queue ORDER BY inserted_at DESC LIMIT 20;
-- =============================================================================
