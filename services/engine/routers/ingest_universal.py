"""
Universal CSV / XLSX import with user-defined column mapping.

POST /v1/ingest/parse-columns  — upload file → detected columns + preview + auto-suggestions
POST /v1/ingest/universal      — upload file + column mapping → write to hash-chained ledger
"""

from __future__ import annotations

import io
import json
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Annotated

import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from lib.supabase_client import get_db, write_audit_log
from middleware.auth import UserContext, require_user

log = logging.getLogger(__name__)
router = APIRouter(tags=["ingest"])

_MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB

# ── Field primitives the ledger understands ───────────────────────────────────
REQUIRED_FIELDS = ["date", "symbol", "side", "quantity", "price"]
OPTIONAL_FIELDS = ["fee", "currency", "notes"]

_SIDE_BUY  = {"buy", "purchase", "bought", "b", "long", "credit", "deposit", "receive", "in"}
_SIDE_SELL = {"sell", "sale", "sold", "s", "short", "debit", "withdrawal", "send", "out"}

# Heuristics for auto-detecting which column maps to which primitive
_HINTS: dict[str, set[str]] = {
    "date":     {"date", "time", "timestamp", "datetime", "trade date", "transaction date",
                 "settlement", "settled", "filled", "created", "executed"},
    "symbol":   {"symbol", "ticker", "asset", "coin", "currency", "pair", "instrument",
                 "market", "product", "name", "base asset", "base currency"},
    "side":     {"side", "type", "direction", "action", "buy/sell", "transaction type",
                 "order type", "kind", "operation"},
    "quantity": {"quantity", "qty", "units", "amount", "size", "volume", "shares",
                 "filled qty", "executed qty", "filled", "executed amount"},
    "price":    {"price", "rate", "unit price", "avg price", "fill price",
                 "executed price", "trade price", "cost per unit"},
    "fee":      {"fee", "fees", "commission", "charge", "trading fee", "network fee"},
    "currency": {"currency", "quote currency", "quote asset", "fiat", "quote"},
    "notes":    {"notes", "note", "memo", "description", "comment", "remarks", "label"},
}


# ── File reader ───────────────────────────────────────────────────────────────

def _read_df(raw: bytes, filename: str) -> pd.DataFrame:
    name = (filename or "").lower()
    if name.endswith(".xlsx") or name.endswith(".xls"):
        return pd.read_excel(io.BytesIO(raw), dtype=str)
    for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
        try:
            return pd.read_csv(io.BytesIO(raw), dtype=str, encoding=enc)
        except UnicodeDecodeError:
            continue
    raise ValueError("Cannot decode file — try saving as UTF-8 CSV")


# ── Value parsers ─────────────────────────────────────────────────────────────

def _parse_float(raw: str) -> float:
    s = (str(raw)
         .replace(",", "").replace("$", "").replace("£", "")
         .replace("€", "").replace("¥", "").strip())
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    return float(s)


_DATE_FMTS = (
    "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y",
    "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M",
    "%d-%m-%Y", "%m-%d-%Y", "%Y%m%d",
    "%b %d, %Y", "%d %b %Y", "%B %d, %Y",
    "%d/%m/%Y %H:%M:%S", "%m/%d/%Y %H:%M:%S",
)

def _parse_date(raw: str) -> date:
    s = str(raw).strip()
    # Unix timestamp?
    try:
        ts = float(s)
        if ts > 1e9:
            return datetime.fromtimestamp(ts / (1000 if ts > 1e12 else 1), tz=timezone.utc).date()
    except ValueError:
        pass
    for fmt in _DATE_FMTS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date format: {s!r}")


def _parse_side(raw: str) -> str:
    v = str(raw).strip().lower()
    if v in _SIDE_BUY:
        return "buy"
    if v in _SIDE_SELL:
        return "sell"
    raise ValueError(f"Cannot determine buy/sell from: {raw!r}")


# ── Auto-detect mapping ───────────────────────────────────────────────────────

def _auto_detect(columns: list[str]) -> dict[str, str | None]:
    lowered = {c.lower().strip(): c for c in columns}
    result: dict[str, str | None] = {f: None for f in REQUIRED_FIELDS + OPTIONAL_FIELDS}

    for field, hints in _HINTS.items():
        if result[field]:
            continue
        # Exact match first
        for hint in hints:
            if hint in lowered:
                result[field] = lowered[hint]
                break
        if result[field]:
            continue
        # Partial match
        for col_lower, col_orig in lowered.items():
            if any(hint in col_lower for hint in hints):
                result[field] = col_orig
                break

    return result


# ── Pydantic models ───────────────────────────────────────────────────────────

class ColumnMap(BaseModel):
    date:      str
    symbol:    str
    side:      str
    quantity:  str
    price:     str
    fee:       str | None = None
    currency:  str | None = None
    notes:     str | None = None


class ParseColumnsResponse(BaseModel):
    columns:      list[str]
    preview_rows: list[dict[str, str]]
    row_count:    int
    detected_map: dict[str, str | None]


class UniversalImportResult(BaseModel):
    inserted:  int
    skipped:   int
    errors:    list[str]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/parse-columns", response_model=ParseColumnsResponse)
async def parse_columns(
    _: Annotated[UserContext, Depends(require_user)],
    file: UploadFile = File(..., description="CSV or XLSX file"),
) -> ParseColumnsResponse:
    """
    Upload a CSV/XLSX and receive:
    - every column name in the file
    - first 5 rows as a preview
    - auto-detected column → primitive mapping suggestions
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "File is empty")
    if len(raw) > _MAX_FILE_BYTES:
        raise HTTPException(413, "File exceeds 10 MB limit")

    try:
        df = _read_df(raw, file.filename or "")
    except Exception as exc:
        raise HTTPException(422, f"Cannot read file: {exc}")

    df = df.dropna(how="all").fillna("")
    columns = [str(c) for c in df.columns]
    preview = [{str(k): str(v) for k, v in row.items()} for row in df.head(5).to_dict("records")]

    return ParseColumnsResponse(
        columns=columns,
        preview_rows=preview,
        row_count=len(df),
        detected_map=_auto_detect(columns),
    )


@router.post("/universal", response_model=UniversalImportResult)
async def universal_import(
    user:    Annotated[UserContext, Depends(require_user)],
    file:    UploadFile = File(...),
    mapping: str        = Form(..., description="JSON-encoded ColumnMap"),
) -> UniversalImportResult:
    """
    Import any CSV/XLSX using a user-supplied column mapping.
    Each row is normalised and appended to the user's hash-chained transaction ledger.
    """
    # ── Parse mapping ─────────────────────────────────────────────────────────
    try:
        col_map = ColumnMap(**json.loads(mapping))
    except Exception as exc:
        raise HTTPException(400, f"Invalid mapping JSON: {exc}")

    # ── Read file ─────────────────────────────────────────────────────────────
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "File is empty")
    if len(raw) > _MAX_FILE_BYTES:
        raise HTTPException(413, "File exceeds 10 MB limit")

    try:
        df = _read_df(raw, file.filename or "")
    except Exception as exc:
        raise HTTPException(422, f"Cannot read file: {exc}")

    df = df.dropna(how="all").fillna("")
    db = get_db()
    inserted = 0
    skipped  = 0
    errors: list[str] = []

    for idx, row in df.iterrows():
        row_num = int(idx) + 2  # 1-indexed + header
        try:
            # Required
            raw_date   = str(row.get(col_map.date,     "") or "").strip()
            raw_symbol = str(row.get(col_map.symbol,   "") or "").strip()
            raw_side   = str(row.get(col_map.side,     "") or "").strip()
            raw_qty    = str(row.get(col_map.quantity,  "") or "").strip()
            raw_price  = str(row.get(col_map.price,    "") or "").strip()

            if not all([raw_date, raw_symbol, raw_side, raw_qty, raw_price]):
                skipped += 1
                continue

            settled  = _parse_date(raw_date)
            symbol   = raw_symbol.upper()
            side     = _parse_side(raw_side)
            quantity = abs(_parse_float(raw_qty))
            price    = abs(_parse_float(raw_price))

            # Optional
            fee = 0.0
            if col_map.fee:
                raw_fee = str(row.get(col_map.fee, "") or "").strip()
                if raw_fee:
                    fee = abs(_parse_float(raw_fee))

            currency = "USD"
            if col_map.currency:
                raw_cur = str(row.get(col_map.currency, "") or "").strip()
                if raw_cur:
                    currency = raw_cur.upper()

            notes = ""
            if col_map.notes:
                notes = str(row.get(col_map.notes, "") or "").strip()

            # Hash chain — get current tip
            tip_res  = db.rpc("get_chain_tip", {"p_user_id": user.user_id}).execute()
            prev_hash = tip_res.data if tip_res.data else "GENESIS"

            db.table("transactions").insert({
                "id":               str(uuid.uuid4()),
                "user_id":          user.user_id,
                "tenant_id":        user.tenant_id,
                "symbol":           symbol,
                "transaction_type": side,
                "net_amount":       round(quantity * price, 8),
                "quantity":         quantity,
                "price":            price,
                "fee":              fee,
                "currency":         currency,
                "notes":            notes,
                "settled_at":       settled.isoformat(),
                "source":           "csv_import",
                "prev_hash":        prev_hash,
            }).execute()

            inserted += 1

        except Exception as exc:
            errors.append(f"Row {row_num}: {exc}")
            if len(errors) >= 50:
                errors.append("Stopped after 50 errors — fix your file and retry")
                break

    write_audit_log(
        event_type="ingest.universal_csv",
        actor_id=user.user_id,
        resource="transactions",
        metadata={
            "file_name": file.filename,
            "inserted":  inserted,
            "skipped":   skipped,
            "errors":    len(errors),
            "tenant_id": user.tenant_id,
        },
    )

    log.info(
        "universal_import user=%s inserted=%d skipped=%d errors=%d",
        user.user_id, inserted, skipped, len(errors),
    )
    return UniversalImportResult(inserted=inserted, skipped=skipped, errors=errors)
