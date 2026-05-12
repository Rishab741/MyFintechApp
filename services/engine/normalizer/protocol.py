"""
Custodian adapter protocol — the contract every adapter must implement.

All custodian-specific parsing (column names, date formats, number formats,
action verb mapping) lives in the adapter. The engine only works with the
normalised models defined here.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Literal

from pydantic import BaseModel, field_validator

# ── Shared types ──────────────────────────────────────────────────────────────

TransactionType = Literal[
    "buy", "sell", "dividend", "interest", "fee",
    "deposit", "withdrawal", "transfer_in", "transfer_out",
    "split", "merger", "tax", "other",
]

_CRYPTO_SUFFIXES = {"-USD", "-USDT", "-BTC", "-ETH", "/USD", "/USDT"}
_KNOWN_ETFS = {
    "SPY", "QQQ", "VTI", "IWM", "GLD", "TLT", "VEA", "AGG", "VOO",
    "VGT", "XLK", "XLF", "XLE", "ARKK", "ARKG", "BNDX", "BND",
    "IJR", "IVV", "IEMG", "EFA", "LQD", "HYG", "IWF", "IWD",
}


def infer_asset_class(symbol: str) -> str:
    s = symbol.upper()
    if any(s.endswith(sfx) or sfx in s for sfx in _CRYPTO_SUFFIXES):
        return "crypto"
    if s in _KNOWN_ETFS:
        return "etf"
    return "equity"


def clean_number(raw: str | None) -> Decimal:
    """Strip $, commas, +, whitespace and convert to Decimal. Returns 0 on failure."""
    if not raw:
        return Decimal("0")
    cleaned = re.sub(r"[$,+\s]", "", str(raw).strip())
    cleaned = cleaned.strip("()")      # (1,234.56) → -1234.56 for parenthetical negatives
    if raw.strip().startswith("("):
        cleaned = "-" + cleaned
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return Decimal("0")


def clean_symbol(raw: str) -> str:
    """Normalise ticker: strip leading $, upper-case, collapse whitespace."""
    return raw.strip().lstrip("$").upper().replace(" ", "")


# ── Normalised models ─────────────────────────────────────────────────────────

class NormalizedHolding(BaseModel):
    symbol:         str
    quantity:       Decimal
    avg_cost_basis: Decimal         # cost per unit in account currency
    last_price:     Decimal | None = None
    currency:       str = "USD"
    account_ref:    str             # custodian's account number / identifier

    @field_validator("symbol", mode="before")
    @classmethod
    def _clean_sym(cls, v: str) -> str:
        return clean_symbol(v)


class NormalizedTransaction(BaseModel):
    symbol:           str | None        # None for pure cash events
    transaction_type: TransactionType
    quantity:         Decimal = Decimal("0")
    price:            Decimal = Decimal("0")
    gross_amount:     Decimal = Decimal("0")
    fees:             Decimal = Decimal("0")
    net_amount:       Decimal            # negative = cash out, positive = cash in
    settled_at:       datetime
    currency:         str = "USD"
    account_ref:      str
    provider_tx_id:   str | None = None  # custodian's own transaction ID
    notes:            str | None = None

    @field_validator("symbol", mode="before")
    @classmethod
    def _clean_sym(cls, v: str | None) -> str | None:
        return clean_symbol(v) if v else None


class IngestResult(BaseModel):
    custodian:            str
    file_name:            str
    holdings_upserted:    int = 0
    transactions_inserted: int = 0
    skipped:              int = 0
    errors:               list[str] = []


# ── Adapter base class ────────────────────────────────────────────────────────

class CustodianAdapter(ABC):
    """
    Abstract base for all custodian CSV/data adapters.

    Subclasses implement parse_holdings and parse_transactions.
    The engine calls these with raw file bytes and writes the result to DB.
    """

    name: str           # machine identifier: 'schwab', 'fidelity', 'csv_generic'
    label: str          # human label: 'Charles Schwab', 'Fidelity Investments'
    supports_holdings:    bool = True
    supports_transactions: bool = True

    @abstractmethod
    def parse_holdings(self, data: bytes) -> list[NormalizedHolding]:
        """Return normalised holdings from raw file bytes."""

    @abstractmethod
    def parse_transactions(self, data: bytes) -> list[NormalizedTransaction]:
        """Return normalised transactions from raw file bytes."""

    def detect_data_type(self, data: bytes) -> Literal["holdings", "transactions", "unknown"]:
        """
        Sniff the file to guess if it contains holdings or transactions.
        Override in subclasses for custodian-specific detection.
        """
        text = data.decode("utf-8", errors="replace")[:2000].lower()
        if any(kw in text for kw in ("quantity", "position", "market value", "cost basis")):
            return "holdings"
        if any(kw in text for kw in ("action", "trade date", "transaction", "bought", "sold")):
            return "transactions"
        return "unknown"
