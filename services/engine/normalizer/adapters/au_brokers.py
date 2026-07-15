"""
Australian broker adapters.

All six share the AuBrokerAdapter implementation (day-first dates, AUD,
auto-detection of statement-style vs trade-table exports). Each subclass
exists to give the broker its own registry slug and label, and as a home
for broker-specific overrides if a format diverges later.

Known export shapes:
  CommSec        — Transactions.csv: Date, Reference, Details, Debit($), Credit($), Balance($)
                   with trades as "B 100 BHP @ 45.67" in Details. Holdings export
                   uses Code / Available Units / Purchase Price / Last Price.
  Westpac O.I.   — same statement layout as CommSec (shared platform lineage).
  nabtrade       — statement layout, plus an orders export with explicit
                   Type / Security / Quantity / Price / Consideration columns.
  SelfWealth     — trade table: Trade Date, Action, Code, Units, Average Price,
                   Brokerage, Total Value.
  Stake (AUS)    — trade table: Date, Type, Symbol/Code, Units, Price, Value,
                   Brokerage.
  CMC Markets    — trade table: Date, Type, Code, Quantity, Price, Consideration,
                   Brokerage, GST.
"""

from __future__ import annotations

from normalizer.adapters.au_base import AuBrokerAdapter


class CommSecAdapter(AuBrokerAdapter):
    name  = "commsec"
    label = "CommSec"


class WestpacAdapter(AuBrokerAdapter):
    name  = "westpac"
    label = "Westpac Online Investing"


class NabTradeAdapter(AuBrokerAdapter):
    name  = "nabtrade"
    label = "nabtrade"


class SelfWealthAdapter(AuBrokerAdapter):
    name  = "selfwealth"
    label = "SelfWealth"


class StakeAdapter(AuBrokerAdapter):
    name  = "stake"
    label = "Stake"


class CmcMarketsAdapter(AuBrokerAdapter):
    name  = "cmc_markets"
    label = "CMC Markets Invest"
