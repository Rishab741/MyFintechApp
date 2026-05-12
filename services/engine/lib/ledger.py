"""
Cryptographic ledger helpers for the Vestara transaction chain.

Responsibilities:
  1. get_chain_tip(user_id)   — fetch the prev_hash needed before INSERT
  2. build_merkle_root(hashes) — SHA-256 Merkle root of a batch of row_hashes
  3. write_checkpoint(...)    — persist a Merkle checkpoint to ledger_checkpoints
  4. verify_chain(user_id)    — Python-side full chain walk (mirrors SQL function)

The SQL trigger (seal_transaction_hash) computes the actual row_hash server-side
so the value cannot be spoofed by the application. The application is only
responsible for supplying the correct prev_hash before INSERT.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any

from lib.supabase_client import get_db

log = logging.getLogger(__name__)

# Checkpoint every N transactions (balance between verification speed and writes)
CHECKPOINT_INTERVAL = 1_000


# ── Chain tip ─────────────────────────────────────────────────────────────────
def get_chain_tip(user_id: str) -> str:
    """
    Return the row_hash of the user's most recent transaction.
    Returns 'GENESIS' if no transactions exist yet.

    Must be called inside a serialized context (e.g. SELECT FOR UPDATE on the
    last row) when inserting concurrent transactions for the same user.
    """
    db = get_db()
    res = db.rpc("get_chain_tip", {"p_user_id": user_id}).execute()
    return res.data or "GENESIS"


# ── Merkle tree ───────────────────────────────────────────────────────────────
def build_merkle_root(hashes: list[str]) -> str:
    """
    Build a SHA-256 Merkle root from a list of hex hash strings.

    Uses a standard binary Merkle tree: pairs of hashes are concatenated and
    hashed together until a single root remains. An odd number of leaves
    duplicates the last leaf (standard Bitcoin/Ethereum convention).

    Returns a 64-char hex string.
    """
    if not hashes:
        return hashlib.sha256(b"EMPTY").hexdigest()

    layer = [bytes.fromhex(h) for h in hashes]

    if len(layer) == 1:
        return hashlib.sha256(layer[0] + layer[0]).hexdigest()

    while len(layer) > 1:
        next_layer = []
        for i in range(0, len(layer), 2):
            left  = layer[i]
            right = layer[i + 1] if i + 1 < len(layer) else left   # duplicate last if odd
            next_layer.append(hashlib.sha256(left + right).digest())
        layer = next_layer

    return layer[0].hex()


# ── Checkpoint writer ─────────────────────────────────────────────────────────
def maybe_write_checkpoint(user_id: str) -> bool:
    """
    Check if a new checkpoint is due for this user and write one if so.

    A checkpoint is written when the number of unhashed transactions since the
    last checkpoint reaches CHECKPOINT_INTERVAL.

    Returns True if a checkpoint was written.
    """
    db = get_db()

    # Count transactions since last checkpoint
    last_cp = (
        db.table("ledger_checkpoints")
        .select("tx_sequence_hi, id")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if last_cp.data:
        last_hi = last_cp.data[0]["tx_sequence_hi"]
        # Fetch transactions after the last checkpoint
        rows_res = (
            db.table("transactions")
            .select("id, row_hash")
            .eq("user_id", user_id)
            .not_.is_("row_hash", "null")
            .order("settled_at", desc=False)
            .order("created_at", desc=False)
            .execute()
        )
        # Filter those with id > last_hi (sequence comparison on UUID is unreliable;
        # we use the full ordered list and take from the offset instead)
        all_rows = rows_res.data or []
        # Find offset past last checkpoint
        offset = next(
            (i + 1 for i, r in enumerate(all_rows) if str(r["id"]) == str(last_hi)),
            0,
        )
        pending = all_rows[offset:]
    else:
        rows_res = (
            db.table("transactions")
            .select("id, row_hash")
            .eq("user_id", user_id)
            .not_.is_("row_hash", "null")
            .order("settled_at", desc=False)
            .order("created_at", desc=False)
            .execute()
        )
        pending = rows_res.data or []
        offset  = 0

    if len(pending) < CHECKPOINT_INTERVAL:
        return False

    # Write checkpoint for the oldest full batch
    batch = pending[:CHECKPOINT_INTERVAL]
    hashes = [r["row_hash"] for r in batch]
    root   = build_merkle_root(hashes)

    db.table("ledger_checkpoints").insert({
        "user_id":        user_id,
        "tx_sequence_lo": 0,             # placeholder — replace with actual seq if using bigserial
        "tx_sequence_hi": 0,
        "tx_count":       len(batch),
        "merkle_root":    root,
        "created_at":     datetime.now(tz=timezone.utc).isoformat(),
    }).execute()

    log.info("ledger checkpoint written: user=%s root=%s...", user_id, root[:16])
    return True


# ── Python-side chain verification ───────────────────────────────────────────
def verify_chain(user_id: str) -> list[dict[str, Any]]:
    """
    Walk the entire transaction chain for a user and return any broken links.

    This mirrors the SQL verify_ledger_integrity() function but runs in Python,
    making it usable in tests without a live DB function.

    Returns a list of dicts: [{tx_id, settled_at, issue}, ...].
    An empty list means the chain is intact.
    """
    db = get_db()
    res = (
        db.table("transactions")
        .select("id, prev_hash, row_hash, net_amount, settled_at, user_id, symbol, transaction_type")
        .eq("user_id", user_id)
        .order("settled_at", desc=False)
        .order("created_at", desc=False)
        .execute()
    )

    rows = res.data or []
    broken: list[dict] = []
    prev_stored = "GENESIS"

    for row in rows:
        stored_prev = row.get("prev_hash") or "GENESIS"

        # 1. Check linkage
        if stored_prev != prev_stored:
            broken.append({
                "tx_id":      row["id"],
                "settled_at": row["settled_at"],
                "issue":      "prev_hash mismatch — chain broken before this transaction",
            })
            break

        # 2. Recompute expected hash
        raw = (
            (row.get("prev_hash") or "GENESIS")
            + str(row["id"])
            + str(row["net_amount"])
            + str(row["settled_at"])
            + str(row["user_id"])
            + (row.get("symbol") or "")
            + row["transaction_type"]
        )
        expected = hashlib.sha256(raw.encode()).hexdigest()

        if row.get("row_hash") != expected:
            broken.append({
                "tx_id":      row["id"],
                "settled_at": row["settled_at"],
                "issue":      "row_hash mismatch — transaction may have been tampered with",
            })
            break

        prev_stored = row["row_hash"]

    return broken
