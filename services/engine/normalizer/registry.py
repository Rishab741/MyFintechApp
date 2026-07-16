"""
Adapter registry — maps custodian slug → adapter class.

Add new adapters here as they're built.
"""

from __future__ import annotations

from normalizer.adapters.au_brokers import (
    CmcMarketsAdapter,
    CommSecAdapter,
    NabTradeAdapter,
    SelfWealthAdapter,
    StakeAdapter,
    WestpacAdapter,
)
from normalizer.adapters.csv_generic import GenericCsvAdapter
from normalizer.adapters.fidelity import FidelityAdapter
from normalizer.adapters.schwab import SchwabAdapter
from normalizer.protocol import CustodianAdapter

_REGISTRY: dict[str, type[CustodianAdapter]] = {
    # US
    "schwab":      SchwabAdapter,
    "fidelity":    FidelityAdapter,
    # Australia
    "commsec":     CommSecAdapter,
    "westpac":     WestpacAdapter,
    "nabtrade":    NabTradeAdapter,
    "selfwealth":  SelfWealthAdapter,
    "stake":       StakeAdapter,
    "cmc_markets": CmcMarketsAdapter,
    # Fallback
    "csv_generic": GenericCsvAdapter,
}


def get_adapter(custodian: str, account_ref: str = "") -> CustodianAdapter:
    """
    Return an initialised adapter for the given custodian slug.
    Raises KeyError if the custodian is not supported.
    """
    cls = _REGISTRY.get(custodian.lower())
    if not cls:
        supported = ", ".join(sorted(_REGISTRY))
        raise KeyError(
            f"Unknown custodian '{custodian}'. "
            f"Supported: {supported}"
        )
    return cls(account_ref=account_ref) if account_ref else cls()


def detect_and_parse(data: bytes) -> tuple[str, list]:
    """
    Auto-detect the best adapter for a transaction CSV by scoring every
    registered adapter against the file.

    Score = number of buy/sell rows with a positive price and quantity —
    the rows the diagnostic can actually use. The adapter that extracts the
    most usable trades wins; registry order breaks ties (AU brokers before
    the generic fallback, so a specific parser beats a lucky generic one).

    Returns (slug, transactions). Raises ValueError if no adapter can
    extract a single usable trade.
    """
    best_slug: str | None = None
    best_txs:  list = []
    best_score = 0

    for slug in _REGISTRY:
        try:
            txs = get_adapter(slug).parse_transactions(data)
        except Exception:
            continue
        score = sum(
            1 for t in txs
            if t.transaction_type in ("buy", "sell") and t.price > 0 and t.quantity > 0
        )
        if score > best_score:
            best_slug, best_txs, best_score = slug, txs, score

    if not best_slug:
        raise ValueError(
            "No adapter could extract trades from this file. "
            "Check that it is a transaction export (not a holdings/positions export) "
            "containing dates, tickers, and buy/sell rows."
        )
    return best_slug, best_txs


def list_custodians() -> list[dict]:
    """Return metadata for all registered adapters."""
    return [
        {
            "slug":                  slug,
            "label":                 cls.label,
            "supports_holdings":     cls.supports_holdings,
            "supports_transactions": cls.supports_transactions,
        }
        for slug, cls in sorted(_REGISTRY.items())
    ]
