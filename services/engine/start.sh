#!/bin/sh
# Startup diagnostics — printed to Railway logs before uvicorn starts.
# Helps diagnose "healthcheck failed" with no obvious error.

echo "============================================"
echo " Vestara Portfolio Engine — Startup Check"
echo "============================================"
echo "PORT            : ${PORT:-8000}"
echo "SUPABASE_URL    : $([ -n "$SUPABASE_URL" ] && echo SET || echo NOT SET)"
echo "SVC_ROLE_KEY    : $([ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && echo SET || echo NOT SET)"
echo "JWT_SECRET      : $([ -n "$SUPABASE_JWT_SECRET" ] && echo SET || echo NOT SET)"
echo "ENGINE_SVC_KEY  : $([ -n "$ENGINE_SERVICE_KEY" ] && echo SET || echo NOT SET)"
echo "LOG_LEVEL       : ${LOG_LEVEL:-info}"
echo "DEBUG           : ${DEBUG:-false}"
echo "============================================"

# Fail fast with a clear message if required vars are missing
MISSING=""
[ -z "$SUPABASE_URL" ]                && MISSING="$MISSING SUPABASE_URL"
[ -z "$SUPABASE_SERVICE_ROLE_KEY" ]   && MISSING="$MISSING SUPABASE_SERVICE_ROLE_KEY"
[ -z "$SUPABASE_JWT_SECRET" ]         && MISSING="$MISSING SUPABASE_JWT_SECRET"
[ -z "$ENGINE_SERVICE_KEY" ]          && MISSING="$MISSING ENGINE_SERVICE_KEY"

if [ -n "$MISSING" ]; then
  echo "ERROR: Missing required environment variables:$MISSING"
  echo "Set these in Railway → your service → Variables tab."
  exit 1
fi

echo "All required env vars present. Starting uvicorn..."
exec uvicorn main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --workers 1 \
  --log-level "${LOG_LEVEL:-info}"
