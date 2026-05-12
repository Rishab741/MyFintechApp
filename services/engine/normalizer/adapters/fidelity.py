"""
Fidelity Investments CSV adapter.

Fidelity exports:
  Holdings:     Account Number, Account Name, Symbol, Description, Quantity,
                Last Price, ..., Cost Basis, Average Cost Basis, Type
  Transactions: Trade Date, Account Number, Action, Symbol, Security Description,
                Security Type, Quantity, Price, Commission, Fees, Amount, Settlement Date
"""

from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from decimal import Decimal

from normalizer.protocol import (
    CustodianAdapter,
    NormalizedHolding,
    NormalizedTransaction,
    TransactionType,
    clean_number,
    clean_symbol,
)

_DATE_FORMATS = ["%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d"]


def _parse_date(raw: str) -> datetime:
    s = raw.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse Fidelity date: {raw!r}")


_ACTION_MAP: dict[str, TransactionType] = {
    "bought":            "buy",
    "reinvestment":      "buy",
    "sold":              "sell",
    "dividend":          "dividend",
    "dividends":         "dividend",
    "qualified dividend":"dividend",
    "interest":          "interest",
    "interest earned":   "interest",
    "deposit":           "deposit",
    "direct deposit":    "deposit",
    "electronic funds transfer received": "deposit",
    "withdrawal":        "withdrawal",
    "electronic funds transfer sent": "withdrawal",
    "fee":               "fee",
    "advisory fee":      "fee",
    "foreign tax paid":  "tax",
    "transfer":          "transfer_in",
}


def _map_action(raw: str) -> TransactionType:
    k = raw.lower().strip()
    for phrase, tx_type in _ACTION_MAP.items():
        if phrase in k:
            return tx_type
    if "buy" in k or "bought" in k or "purchased" in k:
        return "buy"
    if "sell" in k or "sold" in k:
        return "sell"
    if "div" in k:
        return "dividend"
    if "interest" in k:
        return "interest"
    if "fee" in k:
        return "fee"
    return "other"


def _find_header_line(lines: list[str]) -> int:
    """Return the index of the actual CSV header row."""
    for i, line in enumerate(lines):
        lower = line.lower()
        if ("symbol" in lower or "trade date" in lower) and "," in line:
            return i
    return 0


class FidelityAdapter(CustodianAdapter):
    name  = "fidelity"
    label = "Fidelity Investments"

    def __init__(self, account_ref: str = "FIDELITY"):
        self._account_ref = account_ref

    # ── Holdings ──────────────────────────────────────────────────────────────

    def parse_holdings(self, data: bytes) -> list[NormalizedHolding]:
        text  = data.decode("utf-8-sig", errors="replace")
        lines = text.splitlines()
        start = _find_header_line(lines)
        reader = csv.DictReader(io.StringIO("\n".join(lines[start:])))

        results: list[NormalizedHolding] = []
        for row in reader:
            sym_raw = (row.get("Symbol") or "").strip()
            if not sym_raw or sym_raw.lower() in ("pending activity", "cash", ""):
                continue

            sym = clean_symbol(sym_raw)
            qty = clean_number(row.get("Quantity", ""))
            if qty <= 0:
                continue

            # Fidelity provides "Average Cost Basis" (per-unit) directly
            avg_cost   = clean_number(row.get("Average Cost Basis", "") or row.get("Cost Basis", ""))
            last_price = clean_number(row.get("Last Price", "") or row.get("Price", ""))

            # "Account Number" is the account identifier
            acct = (row.get("Account Number") or self._account_ref).strip()

            results.append(NormalizedHolding(
                symbol=sym,
                quantity=qty,
                avg_cost_basis=avg_cost,
                last_price=last_price or None,
                currency="USD",
                account_ref=acct or self._account_ref,
            ))
        return results

    # ── Transactions ──────────────────────────────────────────────────────────

    def parse_transactions(self, data: bytes) -> list[NormalizedTransaction]:
        text  = data.decode("utf-8-sig", errors="replace")
        lines = text.splitlines()
        start = _find_header_line(lines)
        reader = csv.DictReader(io.StringIO("\n".join(lines[start:])))

        results: list[NormalizedTransaction] = []
        for row in reader:
            date_raw = (row.get("Trade Date") or row.get("Settlement Date") or "").strip()
            if not date_raw:
                continue
            try:
                settled = _parse_date(date_raw)
            except ValueError:
                continue

            action  = (row.get("Action") or "").strip()
            tx_type = _map_action(action)

            sym_raw = (row.get("Symbol") or "").strip()
            sym     = clean_symbol(sym_raw) if sym_raw and sym_raw not in ("--", "") else None

            qty        = clean_number(row.get("Quantity", ""))
            price      = clean_number(row.get("Price", ""))
            commission = clean_number(row.get("Commission", ""))
            fees_col   = clean_number(row.get("Fees", ""))
            total_fees = abs(commission) + abs(fees_col)
            net_amount = clean_number(row.get("Amount", ""))

            if net_amount == 0 and qty == 0:
                continue

            gross = abs(qty * price) if qty and price else abs(net_amount) + total_fees
            acct  = (row.get("Account Number") or self._account_ref).strip()

            results.append(NormalizedTransaction(
                symbol=sym,
                transaction_type=tx_type,
                quantity=abs(qty),
                price=abs(price),
                gross_amount=gross,
                fees=total_fees,
                net_amount=net_amount,
                settled_at=settled,
                currency="USD",
                account_ref=acct or self._account_ref,
                notes=row.get("Security Description", "").strip() or None,
            ))
        return results
