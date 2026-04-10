-- =============================================================================
-- Phase 1 — Extensions
--
-- pgvector  — VECTOR column type + similarity search operators (<->, <=>, <#>)
--             Used by the LLM Query Engine (Phase 3) for query embeddings
--             and portfolio context retrieval.
--
-- uuid-ossp — uuid_generate_v4(), used in the data normaliser and some
--             SnapTrade references.
--
-- pg_net    — async HTTP from inside Postgres (already used by ml-pipeline).
-- pg_cron   — scheduled jobs (already used by ml-pipeline cron).
--
-- NOTE: TimescaleDB is NOT available on this Supabase plan.
--       Time-series tables use PostgreSQL-native declarative partitioning
--       (PARTITION BY RANGE) instead — see migration 000003.
-- =============================================================================

-- pgvector (embedding storage + similarity search)
create extension if not exists vector
  schema extensions;

-- uuid-ossp
create extension if not exists "uuid-ossp"
  schema extensions;

-- pg_net and pg_cron are already enabled by migration 000002;
-- these are idempotent no-ops if already present.
create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists supabase_vault;
