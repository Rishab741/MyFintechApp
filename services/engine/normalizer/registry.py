"""
Adapter registry — maps custodian slug → adapter class.

Add new adapters here as they're built.
"""

from __future__ import annotations

from normalizer.adapters.csv_generic import GenericCsvAdapter
from normalizer.adapters.fidelity import FidelityAdapter
from normalizer.adapters.schwab import SchwabAdapter
from normalizer.protocol import CustodianAdapter

_REGISTRY: dict[str, type[CustodianAdapter]] = {
    "schwab":      SchwabAdapter,
    "fidelity":    FidelityAdapter,
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
