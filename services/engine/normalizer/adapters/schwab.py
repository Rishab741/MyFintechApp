"""
Charles Schwab CSV adapter.

Schwab exports two separate CSVs:
  - Positions  (Holdings):     Symbol, Description, Quantity, Price, ..., Cost Basis, ...
  - Transactions:              Date, Action, Symbol, Description, Quantity, Price, Fees & Comm, Amount

Both files begin with a summary header line (e.g. "Positions for account ..."),
followed by a blank line, then the actual CSV.  The parser skips the preamble.
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

_DATE_FORMATS = ["%m/%d/%Y", "%m/%d/%y"]


def _parse_date(raw: str) -> datetime:
    s = raw.strip().split(" as of ")[0].strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse Schwab date: {raw!r}")


_ACTION_MAP: dict[str, TransactionType] = {
    "buy":                  "buy",
    "reinvest shares":      "buy",
    "reinvestment":         "buy",
    "sell":                 "sell",
    "sold":                 "sell",
    "dividend":             "dividend",
    "cash dividend":        "dividend",
    "qual div":             "dividend",
    "special dividend":     "dividend",
    "interest":             "interest",
    "bank interest":        "interest",
    "credit interest":      "interest",
    "moneylink deposit":    "deposit",
    "wire funds received":  "deposit",
    "cash in lieu":         "deposit",
    "moneylink transfer":   "withdrawal",
    "wire funds sent":      "withdrawal",
    "service charge":       "fee",
    "margin interest":      "interest",
    "foreign tax withheld": "tax",
    "journaled shares":     "transfer_in",
    "stock split":          "split",
}


def _map_action(raw: str) -> TransactionType:
    k = raw.lower().strip()
    for phrase, tx_type in _ACTION_MAP.items():
        if phrase in k:
            return tx_type
    if "buy" in k:
        return "buy"
    if "sell" in k:
        return "sell"
    if "div" in k:
        return "dividend"
    if "fee" in k or "charge" in k:
        return "fee"
    return "other"


def _skip_preamble(text: str) -> str:
    """Return the text starting from the first real CSV header line."""
    lines = text.splitlines()
    for i, line in enumerate(lines):
        stripped = line.strip().strip('"')
        if stripped.lower().startswith("symbol") or stripped.lower().startswith("date"):
            return "\n".join(lines[i:])
    return text


class SchwabAdapter(CustodianAdapter):
    name  = "schwab"
    label = "Charles Schwab"

    def __init__(self, account_ref: str = "SCHWAB"):
        self._account_ref = account_ref

    # ── Holdings ──────────────────────────────────────────────────────────────

    def parse_holdings(self, data: bytes) -> list[NormalizedHolding]:
        text   = data.decode("utf-8-sig", errors="replace")
        text   = _skip_preamble(text)
        reader = csv.DictReader(io.StringIO(text))

        results: list[NormalizedHolding] = []
        for row in reader:
            sym_raw = row.get("Symbol", "").strip().strip('"')
            if not sym_raw or sym_raw in ("--", "Cash & Cash Investments", "Account Total"):
                continue

            sym = clean_symbol(sym_raw)
            qty = clean_number(row.get("Quantity", ""))
            if qty <= 0:
                continue

            # Schwab shows total cost basis — divide by quantity for per-unit basis
            total_cost = clean_number(row.get("Cost Basis", "") or row.get("Cost Basis Total", ""))
            avg_cost   = (total_cost / qty) if qty and total_cost else Decimal("0")
            last_price = clean_number(row.get("Price", ""))

            results.append(NormalizedHolding(
                symbol=sym,
                quantity=qty,
                avg_cost_basis=avg_cost,
                last_price=last_price or None,
                currency="USD",
                account_ref=self._account_ref,
            ))
        return results

    # ── Transactions ──────────────────────────────────────────────────────────

    def parse_transactions(self, data: bytes) -> list[NormalizedTransaction]:
        text   = data.decode("utf-8-sig", errors="replace")
        text   = _skip_preamble(text)
        reader = csv.DictReader(io.StringIO(text))

        results: list[NormalizedTransaction] = []
        for row in reader:
            date_raw = row.get("Date", "").strip().strip('"')
            if not date_raw or date_raw.lower() in ("total", ""):
                continue
            try:
                settled = _parse_date(date_raw)
            except ValueError:
                continue

            action  = row.get("Action", "").strip().strip('"')
            tx_type = _map_action(action)

            sym_raw = row.get("Symbol", "").strip().strip('"')
            sym     = clean_symbol(sym_raw) if sym_raw and sym_raw not in ("--", "") else None

            qty        = clean_number(row.get("Quantity", ""))
            price      = clean_number(row.get("Price", ""))
            fees       = clean_number(row.get("Fees & Comm", "") or row.get("Fees", ""))
            net_amount = clean_number(row.get("Amount", ""))

            if net_amount == 0 and qty == 0:
                continue

            gross = abs(qty * price) if qty and price else abs(net_amount)

            results.append(NormalizedTransaction(
                symbol=sym,
                transaction_type=tx_type,
                quantity=abs(qty),
                price=abs(price),
                gross_amount=gross,
                fees=abs(fees),
                net_amount=net_amount,
                settled_at=settled,
                currency="USD",
                account_ref=self._account_ref,
                notes=row.get("Description", "").strip().strip('"') or None,
            ))
        return results
