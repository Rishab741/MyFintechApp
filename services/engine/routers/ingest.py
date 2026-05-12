"""
Custodian data ingest endpoints.

POST /v1/ingest/custodians          — list supported custodians
POST /v1/ingest/{custodian}         — upload a CSV file for holdings or transactions
"""

from __future__ import annotations

import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from lib.supabase_client import get_db, write_audit_log
from middleware.auth import UserContext, require_user
from normalizer.protocol import IngestResult
from normalizer.registry import get_adapter, list_custodians
from normalizer.writer import write_holdings, write_transactions

log = logging.getLogger(__name__)
router = APIRouter(tags=["ingest"])

_MAX_FILE_BYTES = 10 * 1024 * 1024   # 10 MB


class CustodianInfo(BaseModel):
    slug:                  str
    label:                 str
    supports_holdings:     bool
    supports_transactions: bool


# ── GET /v1/ingest/custodians ─────────────────────────────────────────────────

@router.get("/custodians", response_model=list[CustodianInfo])
async def list_supported_custodians(
    _: Annotated[UserContext, Depends(require_user)],
) -> list[CustodianInfo]:
    """Return the list of custodians that the engine can parse."""
    return [CustodianInfo(**c) for c in list_custodians()]


# ── POST /v1/ingest/{custodian} ───────────────────────────────────────────────

@router.post("/{custodian}", response_model=IngestResult, status_code=status.HTTP_200_OK)
async def ingest_file(
    custodian:    str,
    user:         Annotated[UserContext, Depends(require_user)],
    file:         UploadFile = File(..., description="CSV export from your custodian"),
    data_type:    Literal["holdings", "transactions", "auto"] = Form("auto"),
    account_ref:  str = Form("", description="Account number / label (optional override)"),
) -> IngestResult:
    """
    Parse and import a custodian CSV file.

    - `custodian`   — slug from GET /v1/ingest/custodians (e.g. 'schwab', 'fidelity')
    - `data_type`   — 'holdings', 'transactions', or 'auto' (engine sniffs the file)
    - `account_ref` — optional override for the account identifier in the CSV
    - `file`        — the CSV export from your custodian (max 10 MB)

    Returns a summary of rows upserted/inserted and any per-row errors.
    """
    # ── Validate custodian ────────────────────────────────────────────────────
    try:
        adapter = get_adapter(custodian, account_ref=account_ref)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # ── Read file ─────────────────────────────────────────────────────────────
    raw = await file.read()
    if len(raw) > _MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {_MAX_FILE_BYTES // 1024 // 1024} MB.",
        )
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # ── Auto-detect data type ─────────────────────────────────────────────────
    if data_type == "auto":
        detected = adapter.detect_data_type(raw)
        data_type = detected if detected != "unknown" else "holdings"
        log.info("ingest auto-detected data_type=%s for custodian=%s", data_type, custodian)

    result = IngestResult(custodian=custodian, file_name=file.filename or "upload.csv")
    institution_name = adapter.label

    # ── Parse + write ─────────────────────────────────────────────────────────
    if data_type == "holdings":
        try:
            holdings = adapter.parse_holdings(raw)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Parse error: {exc}")

        upserted, errs = write_holdings(user.user_id, institution_name, holdings)
        result.holdings_upserted = upserted
        result.errors.extend(errs)

    elif data_type == "transactions":
        try:
            transactions = adapter.parse_transactions(raw)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Parse error: {exc}")

        inserted, skipped, errs = write_transactions(user.user_id, institution_name, transactions)
        result.transactions_inserted = inserted
        result.skipped               = skipped
        result.errors.extend(errs)

    # ── Audit log ─────────────────────────────────────────────────────────────
    write_audit_log(
        event_type=f"ingest.{custodian}.{data_type}",
        actor_id=user.user_id,
        resource="holdings" if data_type == "holdings" else "transactions",
        metadata={
            "custodian":              custodian,
            "file_name":              file.filename,
            "holdings_upserted":      result.holdings_upserted,
            "transactions_inserted":  result.transactions_inserted,
            "skipped":                result.skipped,
            "errors":                 len(result.errors),
            "tenant_id":              user.tenant_id,
        },
    )

    # ── Log ingest job to DB ──────────────────────────────────────────────────
    try:
        get_db().table("ingest_jobs").insert({
            "user_id":               user.user_id,
            "tenant_id":             user.tenant_id,
            "custodian":             custodian,
            "data_type":             data_type,
            "file_name":             file.filename,
            "status":                "failed" if result.errors and not result.holdings_upserted and not result.transactions_inserted else "done",
            "holdings_upserted":     result.holdings_upserted,
            "tx_inserted":           result.transactions_inserted,
            "skipped":               result.skipped,
            "errors":                result.errors,
        }).execute()
    except Exception as exc:
        log.warning("failed to record ingest_job: %s", exc)

    log.info(
        "ingest complete: custodian=%s user=%s holdings=%d tx=%d skipped=%d errors=%d",
        custodian, user.user_id,
        result.holdings_upserted, result.transactions_inserted,
        result.skipped, len(result.errors),
    )
    return result
