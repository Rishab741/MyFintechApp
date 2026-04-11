-- =============================================================================
-- Phase 2 — Portfolio Engine Integration
--
-- Wires the FastAPI Portfolio Engine into the Supabase data pipeline:
--
--   1. TRIGGER on portfolio_snapshots_v2
--      After every INSERT (fired by the normaliser trigger), calls the
--      compute-metrics edge function for that specific user via pg_net.
--      This keeps performance_cache fresh in near-real-time.
--
--   2. PG_CRON — nightly compute sweep (04:00 UTC)
--      Calls compute-metrics with mode=all to recompute every user's
--      metrics, catching any missed trigger invocations.
--
--   3. PG_CRON — price sync (every 15 min, market hours only)
--      Calls the engine's /sync/prices endpoint so price_history and
--      holdings mark-to-market stay current throughout the trading day.
--
-- ONE-TIME SETUP (run in Supabase SQL editor after deploying):
--   Set the engine URL and service key as Vault secrets:
--
--   SELECT vault.create_secret('https://your-engine.railway.app', 'engine_url');
--   SELECT vault.create_secret('your-engine-service-key', 'engine_service_key');
--
--   These values are also required as Supabase Edge Function environment
--   variables (Settings → Edge Functions → Environment Variables).
-- =============================================================================

-- =============================================================================
-- FUNCTION: private.call_compute_metrics
-- Async HTTP POST to the compute-metrics edge function via pg_net.
-- Passes user_id so the edge function can route to /sync/compute/{user_id}.
-- =============================================================================
create or replace function private.call_compute_metrics(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_project_url constant text := 'https://dukqphhcjdvxxobclahw.supabase.co';
  v_svc_key     text;
  v_request_id  bigint;
begin
  -- Read service role key from Vault (same key used for ML pipeline)
  select decrypted_secret into v_svc_key
  from vault.decrypted_secrets
  where name = 'ml_service_role_key'
  limit 1;

  if v_svc_key is null then
    raise warning 'call_compute_metrics: vault secret "ml_service_role_key" not found';
    return;
  end if;

  select net.http_post(
    url     := v_project_url || '/functions/v1/compute-metrics',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_svc_key
    ),
    body    := jsonb_build_object(
      'user_id', p_user_id::text,
      'mode',    'single'
    )
  ) into v_request_id;

  raise log 'compute-metrics triggered: user=%, request_id=%', p_user_id, v_request_id;

exception when others then
  -- Never crash the INSERT transaction that triggered this
  raise warning 'call_compute_metrics failed for user %: %', p_user_id, sqlerrm;
end;
$$;

-- =============================================================================
-- TRIGGER: fire after every portfolio_snapshots_v2 INSERT
-- The normaliser trigger (migration 006) already populates this table.
-- This trigger fires after it, kicking off the metric computation.
-- =============================================================================
create or replace function private.on_snapshot_v2_compute()
returns trigger
language plpgsql
security definer
as $$
begin
  perform private.call_compute_metrics(new.user_id);
  return new;
end;
$$;

drop trigger if exists compute_on_snapshot_v2_insert on public.portfolio_snapshots_v2;

create trigger compute_on_snapshot_v2_insert
  after insert on public.portfolio_snapshots_v2
  for each row
  execute function private.on_snapshot_v2_compute();

-- =============================================================================
-- PG_CRON: nightly full recompute at 04:00 UTC
-- Calls compute-metrics with mode=all — engine recomputes every user.
-- =============================================================================
select cron.unschedule('compute-metrics-nightly')
where exists (
  select 1 from cron.job where jobname = 'compute-metrics-nightly'
);

select cron.schedule(
  'compute-metrics-nightly',
  '0 4 * * *',
  $cron$
    select private.call_compute_metrics_all();
  $cron$
);

-- Helper for the nightly all-users compute
create or replace function private.call_compute_metrics_all()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_project_url constant text := 'https://dukqphhcjdvxxobclahw.supabase.co';
  v_svc_key     text;
begin
  select decrypted_secret into v_svc_key
  from vault.decrypted_secrets
  where name = 'ml_service_role_key'
  limit 1;

  if v_svc_key is null then
    raise warning 'call_compute_metrics_all: vault secret not found';
    return;
  end if;

  perform net.http_post(
    url     := v_project_url || '/functions/v1/compute-metrics',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_svc_key
    ),
    body    := '{"mode":"all"}'::jsonb
  );
exception when others then
  raise warning 'call_compute_metrics_all failed: %', sqlerrm;
end;
$$;

-- =============================================================================
-- PG_CRON: materialised view refresh — every hour at :05
-- (already scheduled in migration 004, but we keep this as documentation)
-- =============================================================================

-- =============================================================================
-- PG_CRON: daily portfolio snapshot capture at market close (21:30 UTC ≈ 4:30 PM ET)
-- Fires the existing snaptrade_get_holdings edge function for every connected user.
-- This ensures portfolio_snapshots_v2 gets a fresh row even if the user
-- hasn't opened the app that day.
-- =============================================================================
select cron.unschedule('daily-portfolio-snapshot')
where exists (
  select 1 from cron.job where jobname = 'daily-portfolio-snapshot'
);

select cron.schedule(
  'daily-portfolio-snapshot',
  '30 21 * * 1-5',     -- weekdays only, 21:30 UTC (after US market close)
  $cron$
    select private.call_ml_pipeline_for_user(sc.user_id)
    from (
      select distinct user_id
      from public.snaptrade_connections
    ) sc;
  $cron$
);

-- =============================================================================
-- INDEX: speed up the performance_cache lookup in the /portfolio/metrics
-- hot path (user_id + period is the primary query pattern)
-- =============================================================================
create index if not exists performance_cache_user_period_idx
  on public.performance_cache (user_id, period, computed_at desc);
