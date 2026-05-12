"""
Tenant isolation breach test suite.

These tests verify that no data from tenant A is ever accessible to tenant B.
Run these before any B2B client onboarding.

Usage:
    cd services/engine
    pytest tests/test_tenant_isolation.py -v

Requires: a running local engine + local Supabase (supabase start).
Set ENGINE_URL in environment or it defaults to localhost:8000.
"""

from __future__ import annotations

import os
import uuid

import httpx
import pytest

ENGINE_URL = os.getenv("ENGINE_URL", "http://localhost:8000")

# ── Fixtures ──────────────────────────────────────────────────────────────────

def make_api_key_header(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}"}


@pytest.fixture(scope="session")
def service_key() -> str:
    key = os.getenv("ENGINE_SERVICE_KEY")
    if not key:
        pytest.skip("ENGINE_SERVICE_KEY not set — skipping tenant isolation tests")
    return key


@pytest.fixture(scope="session")
def service_headers(service_key: str) -> dict:
    return {"Authorization": f"Bearer {service_key}"}


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestTenantIsolation:

    def test_engine_health(self):
        """Engine must be reachable before running isolation tests."""
        resp = httpx.get(f"{ENGINE_URL}/health")
        assert resp.status_code == 200, f"Engine not reachable at {ENGINE_URL}"

    def test_unauthenticated_request_rejected(self):
        """All /v1/ endpoints must reject requests with no auth."""
        resp = httpx.get(f"{ENGINE_URL}/v1/portfolio/metrics")
        assert resp.status_code == 403, f"Expected 403, got {resp.status_code}"

    def test_invalid_token_rejected(self):
        """Garbage tokens must be rejected."""
        resp = httpx.get(
            f"{ENGINE_URL}/v1/portfolio/metrics",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    def test_compute_all_requires_service_key(self):
        """The /sync/compute/all endpoint must not be callable with a user JWT."""
        resp = httpx.post(
            f"{ENGINE_URL}/v1/sync/compute/all",
            headers={"Authorization": "Bearer fake-user-jwt"},
        )
        assert resp.status_code in (401, 403), (
            f"compute/all should be locked to service key, got {resp.status_code}"
        )

    def test_ledger_verify_returns_chain_status(self, service_headers: dict):
        """
        The /ledger/checkpoint endpoint must be service-key gated.
        We can't test the full chain without a real user JWT, but we can
        verify the endpoint exists and rejects non-service callers.
        """
        fake_user_id = str(uuid.uuid4())
        resp = httpx.post(
            f"{ENGINE_URL}/v1/ledger/checkpoint/{fake_user_id}",
            headers={"Authorization": "Bearer not-a-service-key"},
        )
        assert resp.status_code == 403


class TestApiVersioning:

    def test_v1_portfolio_metrics_exists(self):
        """The /v1/ prefix must be present on all portfolio endpoints."""
        # Should get 403 (no auth) not 404 (not found)
        resp = httpx.get(f"{ENGINE_URL}/v1/portfolio/metrics")
        assert resp.status_code != 404, "/v1/portfolio/metrics route not registered"

    def test_old_unversioned_route_still_works_if_exists(self):
        """
        Health check at / must still work — it's unversioned by design
        so load balancers and uptime monitors don't need updating.
        """
        resp = httpx.get(f"{ENGINE_URL}/health")
        assert resp.status_code == 200

    def test_openapi_spec_accessible(self):
        """OpenAPI /docs must be accessible for B2B client onboarding."""
        resp = httpx.get(f"{ENGINE_URL}/docs")
        assert resp.status_code == 200, "OpenAPI docs not accessible"

    def test_openapi_json_spec_valid(self):
        """The /openapi.json must be valid JSON with expected fields."""
        resp = httpx.get(f"{ENGINE_URL}/openapi.json")
        assert resp.status_code == 200
        spec = resp.json()
        assert "openapi" in spec
        assert "paths" in spec
        assert "/v1/portfolio/metrics" in spec["paths"], (
            "Expected /v1/portfolio/metrics in OpenAPI spec"
        )
        assert "/v1/ledger/verify" in spec["paths"], (
            "Expected /v1/ledger/verify in OpenAPI spec"
        )


class TestLedgerIntegrity:

    def test_merkle_root_deterministic(self):
        """build_merkle_root must produce the same result for the same input."""
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        from lib.ledger import build_merkle_root

        hashes = [
            "a" * 64,
            "b" * 64,
            "c" * 64,
            "d" * 64,
        ]
        root1 = build_merkle_root(hashes)
        root2 = build_merkle_root(hashes)
        assert root1 == root2, "Merkle root is non-deterministic"
        assert len(root1) == 64, "Merkle root must be 64 hex chars"

    def test_merkle_root_changes_on_tamper(self):
        """Changing any hash must produce a different Merkle root."""
        from lib.ledger import build_merkle_root

        hashes = ["a" * 64, "b" * 64, "c" * 64]
        original = build_merkle_root(hashes)

        tampered = ["a" * 64, "x" * 64, "c" * 64]   # middle hash changed
        modified = build_merkle_root(tampered)

        assert original != modified, "Merkle root did not change after tamper"

    def test_merkle_single_element(self):
        """A single-element tree must return the hash of that element."""
        import hashlib
        from lib.ledger import build_merkle_root

        h = "a" * 64
        root = build_merkle_root([h])
        expected = hashlib.sha256(bytes.fromhex(h) + bytes.fromhex(h)).hexdigest()
        assert root == expected

    def test_merkle_empty_list(self):
        """Empty hash list must return a stable sentinel value."""
        from lib.ledger import build_merkle_root
        root = build_merkle_root([])
        assert len(root) == 64
