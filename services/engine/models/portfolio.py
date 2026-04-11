"""
Pydantic response and request models for the Portfolio Engine API.

All monetary values are floats rounded to 2–8 decimal places in the service layer.
All return/ratio values are decimals (0.15 = 15 %) unless the field name ends in _pct.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ── Common ────────────────────────────────────────────────────────────────────
Period = Literal["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "ALL"]


# ── Performance metrics ───────────────────────────────────────────────────────
class PerformanceMetrics(BaseModel):
    """Full risk/return metrics for a single time period."""

    period: Period

    # Returns (decimal)
    total_return:     float = Field(description="Holding-period return. 0.15 = +15 %")
    twr:              float = Field(description="Time-weighted return")
    cagr:             float = Field(description="Compound annual growth rate")
    daily_return_avg: float = Field(description="Mean daily return")

    # Risk
    sharpe_ratio:     float = Field(description="Annualised Sharpe (rf-adjusted)")
    sortino_ratio:    float = Field(description="Annualised Sortino (downside only)")
    calmar_ratio:     float = Field(description="CAGR / |max_drawdown|")
    max_drawdown:     float = Field(description="Peak-to-trough drawdown. -0.25 = -25 %")
    drawdown_days:    int   = Field(description="Calendar days from peak to trough")
    volatility:       float = Field(description="Annualised std dev of daily returns")
    var_95:           float = Field(description="5th-percentile daily return (VaR)")
    cvar_95:          float = Field(description="Expected shortfall beyond VaR")
    win_rate:         float = Field(description="Fraction of days with positive return")

    # Benchmark
    benchmark_symbol: str   = Field(default="SPY")
    benchmark_return: float = Field(description="Benchmark holding-period return")
    alpha:            float = Field(description="Jensen's alpha (annualised)")
    beta:             float = Field(description="Portfolio beta vs benchmark")
    correlation:      float = Field(description="Pearson correlation with benchmark")

    # Snapshot state at computation time
    total_value:      float
    position_count:   int
    cash_pct:         float = Field(description="Cash as fraction of total value")

    computed_at:      datetime
    data_points:      int = Field(description="Number of daily snapshots used")


# ── Exposure ──────────────────────────────────────────────────────────────────
class ExposureSegment(BaseModel):
    label:          str
    market_value:   float
    allocation_pct: float


class AssetClassSegment(ExposureSegment):
    asset_class:    str
    position_count: int


class SectorSegment(ExposureSegment):
    sector: str


class CurrencySegment(ExposureSegment):
    currency: str


class LargestPosition(BaseModel):
    symbol:         str
    allocation_pct: float
    market_value:   float


class ConcentrationRisk(BaseModel):
    top_10_pct:       float = Field(description="% in top-10 holdings")
    top_3_pct:        float = Field(description="% in top-3 holdings")
    herfindahl_index: float = Field(description="HHI: 0 = diversified, 1 = single stock")
    effective_n:      int   = Field(description="Effective number of equal positions")
    largest_position: LargestPosition | None


class ExposureReport(BaseModel):
    by_asset_class: list[dict]
    by_sector:      list[dict]
    by_currency:    list[dict]
    concentration:  ConcentrationRisk
    position_count: int
    total_value:    float
    cash_value:     float
    invested_value: float
    cash_pct:       float


# ── Portfolio history ─────────────────────────────────────────────────────────
class NavPoint(BaseModel):
    """A single point in the portfolio NAV time series."""
    time:            datetime
    total_value:     float
    cash_value:      float
    invested_value:  float
    daily_return:    float | None
    benchmark_value: float | None


class PortfolioHistory(BaseModel):
    period:          Period
    nav_series:      list[NavPoint]
    benchmark_symbol: str
    data_points:     int


# ── Sync responses ────────────────────────────────────────────────────────────
class PriceSyncResult(BaseModel):
    user_id:          str
    symbols_synced:   int
    symbols_failed:   int
    price_rows_written: int
    holdings_updated: int
    synced_at:        datetime


class ComputeResult(BaseModel):
    user_id:          str
    periods_computed: list[Period]
    computed_at:      datetime


# ── Health ────────────────────────────────────────────────────────────────────
class HealthResponse(BaseModel):
    status:  Literal["ok", "degraded", "error"] = "ok"
    version: str = "2.0.0"
    checks:  dict[str, str] = Field(default_factory=dict)
