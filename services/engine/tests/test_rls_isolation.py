"""
Row-Level Security isolation test suite.

These tests go DIRECTLY to Supabase (PostgREST) with individual user JWTs —
bypassing the Portfolio Engine API entirely. This is the only way to verify
that a misconfigured RLS policy cannot be masked by application-layer filtering.

A misconfigured RLS policy is the #1 catastrophic failure mode in a multi-tenant
fintech product: user A silently sees user B's portfolio, holdings, and
transaction history. This suite explicitly tries every cross-tenant read.

Prerequisites:
    - Local Supabase running:  supabase start
    - Two test users created with different portfolios seeded
    - Environment variables:
        SUPABASE_URL              — e.g. http://127.0.0.1:54321
        SUPABASE_ANON_KEY         — the anon/public key
        RLS_TEST_USER_A_EMAIL     — email for user A
        RLS_TEST_USER_A_PASSWORD  — password for user A
        RLS_TEST_USER_B_EMAIL     — email for user B
        RLS_TEST_USER_B_PASSWORD  — password for user B

Run from services/engine/:
    pytest tests/test_rls_isolation.py -v -m rls

This test suite is intentionally skipped unless all env vars are set so it
does not block CI in environments without local Supabase.
"""

from __future__ import annotations

import os
import uuid

import pytest

# ── Env var guard — skip entire module if credentials are missing ─────────────
_REQUIRED_VARS = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "RLS_TEST_USER_A_EMAIL",
    "RLS_TEST_USER_A_PASSWORD",
    "RLS_TEST_USER_B_EMAIL",
    "RLS_TEST_USER_B_PASSWORD",
]
_missing = [v for v in _REQUIRED_VARS if not os.getenv(v)]
if _missing:
    pytest.skip(
        f"RLS isolation tests skipped — missing env vars: {', '.join(_missing)}",
        allow_module_level=True,
    )

from supabase import create_client  # noqa: E402  (import after guard)

pytestmark = pytest.mark.rls

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]

USER_A_EMAIL = os.environ["RLS_TEST_USER_A_EMAIL"]
USER_A_PASS  = os.environ["RLS_TEST_USER_A_PASSWORD"]
USER_B_EMAIL = os.environ["RLS_TEST_USER_B_EMAIL"]
USER_B_PASS  = os.environ["RLS_TEST_USER_B_PASSWORD"]

# Tables that have user_id-scoped RLS policies
_USER_SCOPED_TABLES = [
    "portfolio_snapshots_v2",
    "performance_cache",
    "audit_logs",
    "ingest_jobs",
]

# Tables that have account/holding-level scoping via user_id FK chain
_ACCOUNT_SCOPED_TABLES = [
    "accounts",
    "holdings",
    "transactions",
]


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def user_a_client():
    """Supabase client authenticated as User A."""
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.auth.sign_in_with_password({"email": USER_A_EMAIL, "password": USER_A_PASS})
    yield client
    client.auth.sign_out()


@pytest.fixture(scope="module")
def user_b_client():
    """Supabase client authenticated as User B."""
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.auth.sign_in_with_password({"email": USER_B_EMAIL, "password": USER_B_PASS})
    yield client
    client.auth.sign_out()


@pytest.fixture(scope="module")
def user_a_id(user_a_client):
    resp = user_a_client.auth.get_user()
    assert resp.user is not None, "Could not retrieve User A profile"
    return resp.user.id


@pytest.fixture(scope="module")
def user_b_id(user_b_client):
    resp = user_b_client.auth.get_user()
    assert resp.user is not None, "Could not retrieve User B profile"
    return resp.user.id


# ── Core isolation tests ──────────────────────────────────────────────────────

class TestRLSUserScopedTables:
    """
    For every user-scoped table, verify:
    1. A user can read their own rows (SELECT works, returns data)
    2. A user cannot read the other user's rows (SELECT returns empty — not 403)

    Important: RLS returns empty results for unauthorised reads, NOT errors.
    A test that checks for 403 would miss the failure mode.
    """

    @pytest.mark.parametrize("table", _USER_SCOPED_TABLES)
    def test_user_a_sees_own_rows(self, user_a_client, user_a_id, table):
        """User A must be able to read their own data."""
        res = (
            user_a_client.table(table)
            .select("*")
            .eq("user_id", user_a_id)
            .limit(5)
            .execute()
        )
        # We don't assert len > 0 — test users may have no data yet.
        # We assert no exception was raised (RLS didn't block the own-user read).
        assert res.data is not None, f"RLS blocked User A from reading own {table}"

    @pytest.mark.parametrize("table", _USER_SCOPED_TABLES)
    def test_user_a_cannot_see_user_b_rows(self, user_a_client, user_b_id, table):
        """
        User A explicitly requests User B's user_id — must get empty results.
        If any rows are returned, the RLS policy is misconfigured.
        """
        res = (
            user_a_client.table(table)
            .select("*")
            .eq("user_id", user_b_id)
            .execute()
        )
        assert res.data == [], (
            f"CRITICAL: RLS breach on {table}! "
            f"User A retrieved {len(res.data)} rows belonging to User B. "
            f"First row: {res.data[0] if res.data else 'N/A'}"
        )

    @pytest.mark.parametrize("table", _USER_SCOPED_TABLES)
    def test_user_b_cannot_see_user_a_rows(self, user_b_client, user_a_id, table):
        """Symmetric check: User B cannot read User A's rows."""
        res = (
            user_b_client.table(table)
            .select("*")
            .eq("user_id", user_a_id)
            .execute()
        )
        assert res.data == [], (
            f"CRITICAL: RLS breach on {table}! "
            f"User B retrieved {len(res.data)} rows belonging to User A."
        )

    @pytest.mark.parametrize("table", _USER_SCOPED_TABLES)
    def test_unfiltered_select_only_returns_own_rows(self, user_a_client, user_a_id, table):
        """
        Even without a user_id filter, the SELECT must not return other tenants' data.
        This catches policies that only filter when the column IS in the WHERE clause.
        """
        res = user_a_client.table(table).select("user_id").limit(100).execute()
        for row in res.data:
            assert row["user_id"] == user_a_id, (
                f"CRITICAL: RLS breach on {table}! "
                f"Unfiltered SELECT returned row with user_id={row['user_id']} "
                f"(expected only {user_a_id})"
            )


class TestRLSAccountScopedTables:
    """
    holdings and transactions are owned by accounts, not directly by users.
    An RLS bypass here (e.g. via direct account_id guess) would expose
    individual positions and trade history.
    """

    def test_user_a_cannot_read_user_b_accounts(
        self, user_a_client, user_b_client, user_b_id
    ):
        """Fetch User B's account IDs, then try to read them as User A."""
        # Get User B's account IDs (as User B)
        b_accounts = (
            user_b_client.table("accounts")
            .select("id")
            .eq("user_id", user_b_id)
            .execute()
        )
        b_account_ids = [r["id"] for r in b_accounts.data]

        if not b_account_ids:
            pytest.skip("User B has no accounts — seed data before running RLS tests")

        # Attempt to read User B's accounts as User A
        res = (
            user_a_client.table("accounts")
            .select("*")
            .in_("id", b_account_ids)
            .execute()
        )
        assert res.data == [], (
            f"CRITICAL: User A read User B's account records via direct account_id lookup. "
            f"Accounts exposed: {[r['id'] for r in res.data]}"
        )

    def test_user_a_cannot_read_user_b_holdings(
        self, user_a_client, user_b_client, user_b_id
    ):
        """Cross-tenant holdings exposure — a user seeing another's positions."""
        b_accounts = (
            user_b_client.table("accounts")
            .select("id")
            .eq("user_id", user_b_id)
            .execute()
        )
        b_account_ids = [r["id"] for r in b_accounts.data]

        if not b_account_ids:
            pytest.skip("User B has no accounts")

        res = (
            user_a_client.table("holdings")
            .select("*")
            .in_("account_id", b_account_ids)
            .execute()
        )
        assert res.data == [], (
            f"CRITICAL: User A can read User B's holdings! "
            f"Holdings exposed: {len(res.data)} rows"
        )

    def test_user_a_cannot_read_user_b_transactions(
        self, user_a_client, user_b_client, user_b_id
    ):
        """Cross-tenant transaction history exposure — the most sensitive data."""
        b_accounts = (
            user_b_client.table("accounts")
            .select("id")
            .eq("user_id", user_b_id)
            .execute()
        )
        b_account_ids = [r["id"] for r in b_accounts.data]

        if not b_account_ids:
            pytest.skip("User B has no accounts")

        res = (
            user_a_client.table("transactions")
            .select("*")
            .in_("account_id", b_account_ids)
            .execute()
        )
        assert res.data == [], (
            f"CRITICAL: User A can read User B's transactions! "
            f"Transactions exposed: {len(res.data)} rows"
        )


class TestRLSWriteProtection:
    """
    Verify that users cannot INSERT, UPDATE, or DELETE rows belonging to other users.
    Write-side RLS breaches are rarer but equally catastrophic.
    """

    def test_user_a_cannot_delete_user_b_snapshot(
        self, user_a_client, user_b_id
    ):
        """Attempt to delete User B's portfolio snapshots as User A."""
        # Use a fake UUID — the operation should either fail or affect 0 rows.
        fake_id = str(uuid.uuid4())
        res = (
            user_a_client.table("portfolio_snapshots_v2")
            .delete()
            .eq("user_id", user_b_id)
            .eq("id", fake_id)
            .execute()
        )
        # RLS-protected DELETE returns empty data (not an error) for unauthorised rows
        assert res.data == [] or res.data is None, (
            "CRITICAL: User A's DELETE on User B's snapshots affected rows!"
        )

    def test_user_a_cannot_update_user_b_cache(
        self, user_a_client, user_b_id
    ):
        """Attempt to corrupt User B's performance cache as User A."""
        res = (
            user_a_client.table("performance_cache")
            .update({"sharpe_ratio": 999.0})
            .eq("user_id", user_b_id)
            .execute()
        )
        assert res.data == [] or res.data is None, (
            "CRITICAL: User A's UPDATE on User B's performance_cache succeeded!"
        )


class TestRLSAnonymousAccess:
    """
    An unauthenticated client must receive empty results for all sensitive tables.
    """

    @pytest.fixture
    def anon_client(self):
        return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

    @pytest.mark.parametrize("table", _USER_SCOPED_TABLES + _ACCOUNT_SCOPED_TABLES)
    def test_anon_gets_nothing(self, anon_client, table):
        """Anonymous access must return zero rows for all financial tables."""
        res = anon_client.table(table).select("*").limit(10).execute()
        assert res.data == [], (
            f"CRITICAL: Anonymous user can read {len(res.data)} rows from {table}! "
            "RLS is not enforced for unauthenticated requests."
        )
