"""
Generic CSV adapter — works with any well-formed CSV that has recognisable
column headers for symbol, quantity, cost basis, etc.

Column matching is fuzzy (lowercase, strip punctuation) so minor header
variations across broker exports are handled automatically.

Supported: any brokerage that exports standard holdings/transaction CSVs.
Use custodian-specific adapters (schwab, fidelity) for exact format handling.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timezone

from normalizer.protocol import (
    CustodianAdapter,
    NormalizedHolding,
    NormalizedTransaction,
    TransactionType,
    clean_number,
    clean_symbol,
)

# ── Column name fuzzy matching ────────────────────────────────────────────────

# Whole-word noise: currency codes and GST/tax inclusion qualifiers that vary
# across exports without changing what a column means ("price_aud" is just
# "price"). Stripped as WHOLE WORDS before fusing — not via substring removal,
# so a symbol like "AUSTRALIA" is never partially eaten. See au_base.py's
# _norm_header for the same guard applied to the AU-specific adapters.
_NOISE_TOKENS = {
    "aud", "usd", "nzd", "gbp", "eur", "cad",
    "inc", "incl", "including", "ex", "excl", "excluding", "gst", "tax",
}
_WORD_RE = re.compile(r"[^a-z0-9]+")


def _key(s: str) -> str:
    """Normalise header: lowercase, drop known noise words, fuse the rest."""
    s = _WORD_RE.sub(" ", s.lower())
    tokens = [t for t in s.split() if t]
    filtered = [t for t in tokens if t not in _NOISE_TOKENS]
    return "".join(filtered if filtered else tokens)


HOLDING_COL_MAP: dict[str, list[str]] = {
    "symbol":         ["symbol", "ticker", "securitysymbol", "instrumentsymbol"],
    "quantity":       ["quantity", "qty", "shares", "units", "sharesquantity"],
    "avg_cost_basis": ["averagecostbasis", "avgcostbasis", "costbasis", "averagecost",
                       "costperunit", "purchaseprice", "bookvalue"],
    "last_price":     ["lastprice", "price", "marketprice", "currentprice", "closeprice"],
    "currency":       ["currency", "curr"],
    "account_ref":    ["accountnumber", "account", "accountid", "accountref"],
}

TX_COL_MAP: dict[str, list[str]] = {
    "settled_at":       ["tradedate", "date", "settlementdate", "settledate", "transactiondate"],
    "symbol":           ["symbol", "ticker", "securitysymbol"],
    "transaction_type": ["action", "transactiontype", "type", "description"],
    "quantity":         ["quantity", "qty", "shares", "units"],
    "price":            ["price", "unitprice", "pricepershare"],
    "net_amount":       ["amount", "netamount", "total", "value", "totalvalue", "totalamount"],
    "fees":             ["fees", "commission", "feescomm", "feesandcomm", "brokerage", "brokeragefee"],
    "currency":         ["currency", "curr"],
    "account_ref":      ["accountnumber", "account", "accountid"],
    "provider_tx_id":   ["transactionid", "txid", "referencenumber", "confirmationid"],
    "notes":            ["description", "notes", "memo", "securitydescription"],
}

# Action verb → TransactionType
ACTION_MAP: dict[str, TransactionType] = {
    "buy": "buy", "bought": "buy", "purchase": "buy", "reinvestment": "buy",
    "sell": "sell", "sold": "sell", "sale": "sell",
    "dividend": "dividend", "div": "dividend", "dividendreinvestment": "dividend",
    "interest": "interest", "interestincome": "interest",
    "deposit": "deposit", "journaled": "deposit", "cashin": "deposit", "wire": "deposit",
    "withdrawal": "withdrawal", "cashout": "withdrawal",
    "transferin": "transfer_in", "transferout": "transfer_out",
    "fee": "fee", "fees": "fee", "advisoryfee": "fee", "managementfee": "fee",
    "tax": "tax", "taxwithheld": "tax",
    "split": "split", "stocksplit": "split",
    "merger": "merger",
}

DATE_FORMATS = [
    "%m/%d/%Y", "%m/%d/%y",
    "%Y-%m-%d", "%d/%m/%Y",
    "%d-%b-%Y", "%b %d, %Y",
    "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ",
]


def _parse_date(raw: str) -> datetime | None:
    s = raw.strip().split(" as of ")[0].strip()   # Schwab adds "as of" suffix
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _find_col(headers: list[str], aliases: list[str]) -> str | None:
    hmap = {_key(h): h for h in headers}
    for alias in aliases:
        if alias in hmap:
            return hmap[alias]
    return None


def _map_action(raw: str) -> TransactionType:
    k = _key(raw)
    for action, tx_type in ACTION_MAP.items():
        if action in k:
            return tx_type
    return "other"


def _read_csv_rows(data: bytes) -> tuple[list[str], list[dict]]:
    """
    Decode bytes, skip non-CSV preamble lines, return (headers, rows).
    Many brokers prepend account summary lines before the actual CSV headers.
    """
    text = data.decode("utf-8-sig", errors="replace")   # handle BOM
    lines = text.splitlines()

    # Find the header row: the first row with >= 3 comma-separated tokens
    # where at least one token looks like a column header (no pure numbers)
    header_idx = 0
    for i, line in enumerate(lines):
        stripped = line.strip().strip('"')
        if not stripped:
            continue
        cols = [c.strip().strip('"') for c in line.split(",")]
        if len(cols) >= 3 and not all(
            re.match(r"^[\d$.%\s-]*$", c) for c in cols if c
        ):
            header_idx = i
            break

    csv_text = "\n".join(lines[header_idx:])
    reader = csv.DictReader(io.StringIO(csv_text))
    headers = reader.fieldnames or []
    rows = []
    for row in reader:
        # Skip footer / summary rows (empty symbol or all-blank)
        if not any(v.strip() for v in row.values()):
            continue
        rows.append(dict(row))
    return list(headers), rows


# ── Adapter ───────────────────────────────────────────────────────────────────

class GenericCsvAdapter(CustodianAdapter):
    name  = "csv_generic"
    label = "Generic CSV"

    def __init__(self, account_ref: str = "IMPORT"):
        self._account_ref = account_ref

    def parse_holdings(self, data: bytes) -> list[NormalizedHolding]:
        headers, rows = _read_csv_rows(data)
        col = {
            field: _find_col(headers, aliases)
            for field, aliases in HOLDING_COL_MAP.items()
        }

        if not col["symbol"] or not col["quantity"]:
            raise ValueError(
                "CSV does not contain recognisable 'symbol' and 'quantity' columns. "
                f"Found headers: {headers}"
            )

        results: list[NormalizedHolding] = []
        for row in rows:
            raw_sym = row.get(col["symbol"], "").strip()
            if not raw_sym or raw_sym in ("-", "--", "Cash", ""):
                continue

            sym = clean_symbol(raw_sym)
            qty = clean_number(row.get(col["quantity"] or "", ""))
            if qty <= 0:
                continue

            cost = clean_number(row.get(col["avg_cost_basis"] or "", "")) if col["avg_cost_basis"] else None
            price = clean_number(row.get(col["last_price"] or "", "")) if col["last_price"] else None
            acct = row.get(col["account_ref"] or "", self._account_ref).strip() or self._account_ref

            results.append(NormalizedHolding(
                symbol=sym,
                quantity=qty,
                avg_cost_basis=cost or price or qty * 0,
                last_price=price,
                currency=row.get(col["currency"] or "", "USD").strip() or "USD",
                account_ref=acct,
            ))
        return results

    def parse_transactions(self, data: bytes) -> list[NormalizedTransaction]:
        headers, rows = _read_csv_rows(data)
        col = {
            field: _find_col(headers, aliases)
            for field, aliases in TX_COL_MAP.items()
        }

        if not col["settled_at"] or not col["net_amount"]:
            raise ValueError(
                "CSV does not contain recognisable date and amount columns. "
                f"Found headers: {headers}"
            )

        results: list[NormalizedTransaction] = []
        for row in rows:
            raw_date = row.get(col["settled_at"] or "", "").strip()
            settled = _parse_date(raw_date)
            if not settled:
                continue

            raw_amount = row.get(col["net_amount"] or "", "").strip()
            if not raw_amount:
                continue

            raw_sym = row.get(col["symbol"] or "", "").strip() if col["symbol"] else ""
            sym = clean_symbol(raw_sym) if raw_sym and raw_sym not in ("-", "--") else None

            action_raw = row.get(col["transaction_type"] or "", "").strip() if col["transaction_type"] else ""
            tx_type = _map_action(action_raw)

            results.append(NormalizedTransaction(
                symbol=sym,
                transaction_type=tx_type,
                quantity=clean_number(row.get(col["quantity"] or "", "")) if col["quantity"] else 0,
                price=clean_number(row.get(col["price"] or "", "")) if col["price"] else 0,
                fees=clean_number(row.get(col["fees"] or "", "")) if col["fees"] else 0,
                net_amount=clean_number(raw_amount),
                settled_at=settled,
                currency=row.get(col["currency"] or "", "USD").strip() or "USD",
                account_ref=row.get(col["account_ref"] or "", self._account_ref).strip() or self._account_ref,
                provider_tx_id=row.get(col["provider_tx_id"] or "", "").strip() or None,
                notes=row.get(col["notes"] or "", "").strip() or None,
            ))
        return results
