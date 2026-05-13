"""
Locust load test for the Vestara Portfolio Engine.

Simulates realistic B2B API traffic against the CPU-bound calculation endpoints.
The /v1/portfolio/metrics endpoint is the main target — it runs Sharpe, Beta,
Drawdown, and CAGR computations on every request when cache is cold.

Usage:
    # Install: pip install locust
    # Run headless at 500 users (target = your Railway URL):
    locust -f tests/locustfile.py \
        --headless \
        --users 500 \
        --spawn-rate 25 \
        --run-time 2m \
        --host https://your-engine.up.railway.app

    # Run with web UI (open http://localhost:8089):
    locust -f tests/locustfile.py --host https://your-engine.up.railway.app

Environment variables required:
    LOAD_TEST_JWT       — a valid Supabase user JWT (long-lived service token)
    LOAD_TEST_API_KEY   — a valid vst_live_... API key for B2B user simulation

Interpreting results:
    p50 < 200ms  → good (cache hit path)
    p95 < 1000ms → acceptable (cache miss / live compute)
    p99 > 3000ms → danger zone — scale up Railway container or add workers
    error rate > 1% → investigate 429 (rate limit) or 500 (crash) logs
"""

from __future__ import annotations

import os
import random

from locust import HttpUser, between, events, task
from locust.runners import MasterRunner

# ── Auth headers ───────────────────────────────────────────────────────────────
# Loaded once at import time so every simulated user uses them.
# In a real load test, you'd rotate through multiple test-user tokens.
_JWT = os.getenv("LOAD_TEST_JWT", "")
_API_KEY = os.getenv("LOAD_TEST_API_KEY", "")

_JWT_HEADERS = {"Authorization": f"Bearer {_JWT}", "Content-Type": "application/json"}
_API_KEY_HEADERS = {"Authorization": f"Bearer {_API_KEY}", "Content-Type": "application/json"}

PERIODS = ["1M", "3M", "6M", "1Y", "ALL"]


# ── User: regular Supabase JWT user (mobile app / web dashboard traffic) ──────
class PortfolioUser(HttpUser):
    """
    Simulates a user browsing their portfolio dashboard.
    Reads metrics, exposure, and history with realistic think time.
    Uses a Supabase JWT — same path as the mobile app.
    """
    wait_time = between(1, 3)       # 1-3s think time between requests
    weight = 70                     # 70% of simulated traffic

    @task(5)
    def get_metrics(self):
        period = random.choice(PERIODS)
        with self.client.get(
            f"/v1/portfolio/metrics?period={period}",
            headers=_JWT_HEADERS,
            name="/v1/portfolio/metrics",
            catch_response=True,
        ) as resp:
            if resp.status_code == 404:
                # No portfolio data for this test user — not a failure
                resp.success()
            elif resp.status_code == 429:
                resp.failure("Rate limited")
            elif resp.status_code >= 500:
                resp.failure(f"Server error: {resp.text[:200]}")

    @task(3)
    def get_exposure(self):
        with self.client.get(
            "/v1/portfolio/exposure",
            headers=_JWT_HEADERS,
            name="/v1/portfolio/exposure",
            catch_response=True,
        ) as resp:
            if resp.status_code == 404:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Server error: {resp.text[:200]}")

    @task(2)
    def get_history(self):
        period = random.choice(["1M", "3M", "6M"])
        with self.client.get(
            f"/v1/portfolio/history?period={period}",
            headers=_JWT_HEADERS,
            name="/v1/portfolio/history",
            catch_response=True,
        ) as resp:
            if resp.status_code == 404:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Server error: {resp.text[:200]}")

    @task(1)
    def get_audit_logs(self):
        with self.client.get(
            "/v1/audit/logs?limit=20",
            headers=_JWT_HEADERS,
            name="/v1/audit/logs",
            catch_response=True,
        ) as resp:
            if resp.status_code >= 500:
                resp.failure(f"Server error: {resp.text[:200]}")


# ── User: B2B API key user (institutional client, batch reads) ────────────────
class B2BApiUser(HttpUser):
    """
    Simulates a B2B client making batch API calls with an API key.
    Higher request rate, shorter think time.
    """
    wait_time = between(0.1, 0.5)   # aggressive polling
    weight = 30                     # 30% of simulated traffic

    @task(8)
    def get_metrics_all_periods(self):
        """B2B clients often poll all periods in sequence for reporting."""
        period = random.choice(PERIODS)
        with self.client.get(
            f"/v1/portfolio/metrics?period={period}",
            headers=_API_KEY_HEADERS,
            name="/v1/portfolio/metrics [api_key]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 404:
                resp.success()
            elif resp.status_code == 429:
                resp.failure("Rate limited — check tier daily limit")
            elif resp.status_code >= 500:
                resp.failure(f"Server error: {resp.text[:200]}")

    @task(2)
    def get_exposure_report(self):
        with self.client.get(
            "/v1/portfolio/exposure",
            headers=_API_KEY_HEADERS,
            name="/v1/portfolio/exposure [api_key]",
            catch_response=True,
        ) as resp:
            if resp.status_code == 404:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Server error: {resp.text[:200]}")


# ── Liveness probe user (mimics Railway + load balancer healthchecks) ─────────
class HealthCheckUser(HttpUser):
    """
    Constant liveness probe traffic.  The /health endpoint must always return
    200 instantly — any latency here means the engine is overloaded.
    """
    wait_time = between(5, 10)
    weight = 5

    @task
    def health(self):
        with self.client.get("/health", name="/health", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"Health check failed: {resp.status_code}")
            elif resp.elapsed.total_seconds() > 0.5:
                resp.failure(
                    f"Health check too slow: {resp.elapsed.total_seconds():.2f}s "
                    "(engine is overloaded)"
                )


# ── Event hooks ───────────────────────────────────────────────────────────────
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    if not _JWT and not _API_KEY:
        print(
            "\n[WARN] Neither LOAD_TEST_JWT nor LOAD_TEST_API_KEY is set. "
            "All requests will return 401 — set at least one token.\n"
        )
    if isinstance(environment.runner, MasterRunner):
        print("[INFO] Running distributed load test — workers will use the same tokens.")


@events.quitting.add_listener
def on_quitting(environment, **kwargs):
    """Fail CI if error rate exceeds 1% or p95 exceeds 3 seconds."""
    stats = environment.runner.stats
    total = stats.total

    if total.num_requests == 0:
        print("[WARN] No requests completed — check host URL and credentials.")
        return

    error_rate = total.num_failures / total.num_requests
    p95_ms = total.get_response_time_percentile(0.95)

    print(f"\n=== Load Test Summary ===")
    print(f"  Requests:   {total.num_requests:,}")
    print(f"  Failures:   {total.num_failures:,} ({error_rate:.1%})")
    print(f"  p50:        {total.get_response_time_percentile(0.50):.0f} ms")
    print(f"  p95:        {p95_ms:.0f} ms")
    print(f"  p99:        {total.get_response_time_percentile(0.99):.0f} ms")
    print(f"  RPS (peak): {total.max_rps:.1f}")

    if error_rate > 0.01:
        print(f"\n[FAIL] Error rate {error_rate:.1%} exceeds 1% threshold.")
        environment.process_exit_code = 1
    elif p95_ms > 3000:
        print(f"\n[FAIL] p95 latency {p95_ms:.0f}ms exceeds 3000ms threshold.")
        environment.process_exit_code = 1
    else:
        print("\n[PASS] Load test passed all thresholds.")
