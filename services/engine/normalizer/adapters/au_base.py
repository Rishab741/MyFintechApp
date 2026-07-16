"""
Shared parsing layer for Australian broker exports.

Australian conventions that differ from the US adapters:
  - Dates are DD/MM/YYYY. A US-style parser reads 03/07/2025 as March 7 instead
    of July 3 — silently corrupting every metric downstream. All date parsing
    here is day-first.
  - Currency is AUD.
  - Two export styles exist in the wild:
      1. Cash-statement style (CommSec, Westpac Online Investing, nabtrade):
         columns like Date, Reference, Details, Debit($), Credit($), Balance($),
         with the trade encoded in free text: "B 100 BHP @ 45.67".
      2. Trade-table style (SelfWealth, Stake, CMC Markets):
         explicit Action/Code/Units/Price columns, but header names vary per
         broker — resolved through the alias tables below.
  Both styles are auto-detected per file, so an adapter works even when a
  broker offers multiple export formats.
"""

from __future__ import annotations

import csv
import io
import re
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

# ── Date parsing (day-first) ──────────────────────────────────────────────────

_AU_DATE_FORMATS = (
    "%d/%m/%Y", "%d/%m/%y",
    "%d-%m-%Y", "%d-%m-%y",
    "%d %b %Y", "%d %B %Y",
    "%Y-%m-%d",                 # ISO — some exports use it
)


def parse_au_date(raw: str) -> datetime:
    s = raw.strip().strip('"')
    for fmt in _AU_DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    raise ValueError(f"Cannot parse AU date: {raw!r}")


# ── Column alias resolution ───────────────────────────────────────────────────
# Broker header names vary ("Trade Date" / "Date", "Code" / "Security" / "Symbol",
# "Units" / "Quantity", "Brokerage" / "Brokerage (Inc GST)" ...). Aliases are
# matched against lower-cased, stripped headers; first hit wins.

_TX_ALIASES: dict[str, tuple[str, ...]] = {
    "date": (
        "trade date", "transaction date", "order date", "date",
        "executed", "execution date",
    ),
    "action": (
        "action", "buy/sell", "side", "transaction type", "order type", "type",
    ),
    "symbol": (
        "asx code", "security code", "code", "symbol", "security",
        "ticker", "instrument",
    ),
    "quantity": (
        "units", "quantity", "volume", "shares", "no. of units",
    ),
    "price": (
        "average price", "avg price", "unit price", "execution price",
        "price ($)", "price",
    ),
    "fees": (
        "brokerage (inc gst)", "brokerage+gst", "brokerage ($)", "brokerage",
        "fees", "commission",
    ),
    # Some exports split GST out of brokerage into its own column — summed into fees.
    "fees_gst": (
        "gst ($)", "gst",
    ),
    "amount": (
        "total amount", "total value", "consideration", "net value",
        "net proceeds", "net amount", "total ($)", "value", "amount", "total",
    ),
    "details": (
        "details", "description", "narrative", "particulars",
    ),
    "debit": (
        "debit($)", "debit ($)", "debit",
    ),
    "credit": (
        "credit($)", "credit ($)", "credit",
    ),
}

_HOLDING_ALIASES: dict[str, tuple[str, ...]] = {
    "symbol":   ("asx code", "code", "symbol", "security", "ticker"),
    "quantity": ("available units", "avail units", "units", "quantity", "volume", "balance"),
    "cost":     ("purchase price", "average price", "avg price", "avg cost",
                 "purchase $", "cost basis", "cost"),
    "price":    ("last price", "last $", "market price", "last", "price"),
}


def _norm_header(h: str) -> str:
    return h.strip().strip('"').lower()


def resolve_columns(
    fieldnames: list[str] | None,
    aliases: dict[str, tuple[str, ...]],
) -> dict[str, str]:
    """Map logical field → actual CSV header for this file."""
    if not fieldnames:
        return {}
    normed = {_norm_header(f): f for f in fieldnames if f}
    out: dict[str, str] = {}
    for field, names in aliases.items():
        for candidate in names:
            if candidate in normed:
                out[field] = normed[candidate]
                break
    return out


# ── Statement-style parsing ("B 100 BHP @ 45.67" in a Details column) ─────────

# Matches: "B 100 BHP @ 45.67", "S 1,500 VAS @ $88.960000", case-insensitive.
_DETAILS_TRADE_RE = re.compile(
    r"\b([BS])\s+([\d,]+)\s+([A-Z0-9]{2,6})\s+@\s+\$?([\d,]+(?:\.\d+)?)",
    re.IGNORECASE,
)

_CASH_KEYWORDS: tuple[tuple[str, TransactionType], ...] = (
    ("dividend",       "dividend"),
    ("distribution",   "dividend"),
    ("interest",       "interest"),
    ("direct credit",  "deposit"),
    ("deposit",        "deposit"),
    ("direct debit",   "withdrawal"),
    ("withdrawal",     "withdrawal"),
    ("transfer in",    "transfer_in"),
    ("transfer out",   "transfer_out"),
    ("fee",            "fee"),
    ("gst",            "fee"),
    ("tax",            "tax"),
)


def _classify_cash_event(details: str) -> TransactionType:
    d = details.lower()
    for keyword, tx_type in _CASH_KEYWORDS:
        if keyword in d:
            return tx_type
    return "other"


def parse_statement_rows(
    reader: csv.DictReader,
    cols: dict[str, str],
    account_ref: str,
) -> list[NormalizedTransaction]:
    results: list[NormalizedTransaction] = []
    for row in reader:
        date_raw = (row.get(cols["date"]) or "").strip()
        if not date_raw:
            continue
        try:
            settled = parse_au_date(date_raw)
        except ValueError:
            continue

        details = (row.get(cols.get("details", ""), "") or "").strip().strip('"')
        debit   = abs(clean_number(row.get(cols.get("debit", ""), "")))
        credit  = abs(clean_number(row.get(cols.get("credit", ""), "")))

        m = _DETAILS_TRADE_RE.search(details)
        if m:
            side, qty_raw, code, price_raw = m.groups()
            is_buy = side.upper() == "B"
            qty    = clean_number(qty_raw)
            price  = clean_number(price_raw)
            gross  = qty * price
            cash   = debit if is_buy else credit
            # Buy: debit = gross + brokerage.  Sell: credit = gross - brokerage.
            fees   = (cash - gross) if is_buy else (gross - cash)
            if fees < 0:
                fees = Decimal("0")
            results.append(NormalizedTransaction(
                symbol=clean_symbol(code),
                transaction_type="buy" if is_buy else "sell",
                quantity=qty,
                price=price,
                gross_amount=gross,
                fees=fees,
                net_amount=-cash if is_buy else cash,
                settled_at=settled,
                currency="AUD",
                account_ref=account_ref,
                notes=details or None,
            ))
            continue

        # Non-trade cash event
        amount = credit - debit
        if amount == 0:
            continue
        results.append(NormalizedTransaction(
            symbol=None,
            transaction_type=_classify_cash_event(details),
            net_amount=amount,
            gross_amount=abs(amount),
            settled_at=settled,
            currency="AUD",
            account_ref=account_ref,
            notes=details or None,
        ))
    return results


# ── Trade-table parsing (explicit Action/Code/Units/Price columns) ────────────

_ACTION_MAP: dict[str, TransactionType] = {
    "buy": "buy", "b": "buy", "bought": "buy", "purchase": "buy",
    "sell": "sell", "s": "sell", "sold": "sell",
    "dividend": "dividend", "distribution": "dividend", "div": "dividend",
    "interest": "interest",
    "deposit": "deposit", "withdrawal": "withdrawal",
    "fee": "fee", "brokerage": "fee",
}


def _map_action(raw: str) -> TransactionType:
    k = raw.lower().strip()
    if k in _ACTION_MAP:
        return _ACTION_MAP[k]
    for phrase, tx_type in _ACTION_MAP.items():
        if phrase in k:
            return tx_type
    return "other"


def parse_trade_table_rows(
    reader: csv.DictReader,
    cols: dict[str, str],
    account_ref: str,
) -> list[NormalizedTransaction]:
    results: list[NormalizedTransaction] = []
    for row in reader:
        date_raw = (row.get(cols["date"]) or "").strip()
        if not date_raw or date_raw.lower() in ("total", ""):
            continue
        try:
            settled = parse_au_date(date_raw)
        except ValueError:
            continue

        action  = (row.get(cols.get("action", ""), "") or "").strip()
        tx_type = _map_action(action)

        sym_raw = (row.get(cols.get("symbol", ""), "") or "").strip()
        sym     = clean_symbol(sym_raw) if sym_raw else None

        qty   = abs(clean_number(row.get(cols.get("quantity", ""), "")))
        price = abs(clean_number(row.get(cols.get("price", ""), "")))
        fees  = abs(clean_number(row.get(cols.get("fees", ""), ""))) \
              + abs(clean_number(row.get(cols.get("fees_gst", ""), "")))
        amt   = abs(clean_number(row.get(cols.get("amount", ""), "")))

        if qty == 0 and amt == 0:
            continue

        gross = qty * price if qty and price else amt

        # Sign convention: buys are cash out (negative), sells cash in (positive).
        if amt:
            cash = amt
        elif tx_type == "buy":
            cash = gross + fees
        else:
            cash = gross - fees if gross > fees else gross

        net = -cash if tx_type == "buy" else cash

        results.append(NormalizedTransaction(
            symbol=sym,
            transaction_type=tx_type,
            quantity=qty,
            price=price,
            gross_amount=gross,
            fees=fees,
            net_amount=net,
            settled_at=settled,
            currency="AUD",
            account_ref=account_ref,
            notes=action or None,
        ))
    return results


# ── Preamble skipping ─────────────────────────────────────────────────────────
# CommSec/Westpac exports often begin with account-summary lines before the
# real CSV header. Find the first line that resolves a date column plus either
# a symbol column or a statement-style details/debit column.

def find_header_start(text: str) -> str:
    lines = text.splitlines()
    for i, line in enumerate(lines[:30]):
        try:
            headers = next(csv.reader([line]))
        except StopIteration:
            continue
        cols = resolve_columns(headers, _TX_ALIASES)
        if "date" in cols and ("symbol" in cols or "details" in cols or "debit" in cols):
            return "\n".join(lines[i:])
    return text


# ── Base adapter ──────────────────────────────────────────────────────────────

class AuBrokerAdapter(CustodianAdapter):
    """
    Shared implementation for all Australian brokers. Detects statement-style
    vs trade-table exports per file, so an adapter keeps working when a broker
    offers both formats.
    """

    def __init__(self, account_ref: str = ""):
        self._account_ref = account_ref or self.name.upper()

    # ── Transactions ──────────────────────────────────────────────────────────

    def parse_transactions(self, data: bytes) -> list[NormalizedTransaction]:
        text   = data.decode("utf-8-sig", errors="replace")
        text   = find_header_start(text)
        reader = csv.DictReader(io.StringIO(text))
        cols   = resolve_columns(reader.fieldnames, _TX_ALIASES)

        if "date" not in cols:
            raise ValueError(
                f"{self.label}: no recognisable date column. "
                f"Headers found: {reader.fieldnames}"
            )

        # Statement style: Debit/Credit columns with a Details narrative.
        if "debit" in cols and "credit" in cols and "details" in cols:
            return parse_statement_rows(reader, cols, self._account_ref)

        # Trade-table style: explicit action + symbol columns.
        if "symbol" in cols:
            return parse_trade_table_rows(reader, cols, self._account_ref)

        raise ValueError(
            f"{self.label}: unrecognised export format. "
            f"Headers found: {reader.fieldnames}"
        )

    # ── Holdings ──────────────────────────────────────────────────────────────

    def parse_holdings(self, data: bytes) -> list[NormalizedHolding]:
        text   = data.decode("utf-8-sig", errors="replace")
        text   = find_header_start(text)
        reader = csv.DictReader(io.StringIO(text))
        cols   = resolve_columns(reader.fieldnames, _HOLDING_ALIASES)

        if "symbol" not in cols or "quantity" not in cols:
            return []

        results: list[NormalizedHolding] = []
        for row in reader:
            sym_raw = (row.get(cols["symbol"]) or "").strip()
            if not sym_raw or sym_raw.lower() in ("total", "cash", "--"):
                continue
            qty = clean_number(row.get(cols["quantity"], ""))
            if qty <= 0:
                continue
            results.append(NormalizedHolding(
                symbol=clean_symbol(sym_raw),
                quantity=qty,
                avg_cost_basis=abs(clean_number(row.get(cols.get("cost", ""), ""))),
                last_price=abs(clean_number(row.get(cols.get("price", ""), ""))) or None,
                currency="AUD",
                account_ref=self._account_ref,
            ))
        return results
