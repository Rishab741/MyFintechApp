"""
Unit tests for all financial calculation functions.

All inputs are deterministic; expected values are either hand-calculated
or derived directly from the underlying numpy formula so the test verifies
the implementation, not a magic number.

Run from services/engine/:
    pytest tests/test_calculations.py -v
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import numpy as np
import pytest

from calculations.returns import (
    annualise_return,
    compute_cagr,
    compute_daily_returns,
    compute_mwr,
    compute_period_return,
    compute_twr,
    slice_by_period,
)
from calculations.risk import (
    classify_volatility_regime,
    compute_alpha,
    compute_beta,
    compute_calmar,
    compute_correlation,
    compute_cvar,
    compute_max_drawdown,
    compute_sharpe,
    compute_sortino,
    compute_var,
    compute_volatility,
    compute_win_rate,
)
from calculations.exposure import (
    build_exposure_report,
    compute_asset_class_exposure,
    compute_concentration_risk,
    compute_currency_exposure,
    compute_sector_exposure,
)


# ── TWR ───────────────────────────────────────────────────────────────────────

class TestTWR:
    def test_two_periods_gain(self):
        # 100 → 110 → 121 = +10% then +10% = +21% total
        assert abs(compute_twr([100, 110, 121]) - 0.21) < 1e-10

    def test_flat_portfolio(self):
        assert compute_twr([100, 100, 100]) == pytest.approx(0.0)

    def test_single_period_gain(self):
        assert compute_twr([100, 110]) == pytest.approx(0.10)

    def test_single_period_loss(self):
        assert compute_twr([100, 90]) == pytest.approx(-0.10)

    def test_recovers_to_zero(self):
        # 100 → 50 → 100: -50% then +100% = chain = 0.5 * 2.0 - 1 = 0.0
        assert compute_twr([100, 50, 100]) == pytest.approx(0.0)

    def test_fewer_than_2_points(self):
        assert compute_twr([100]) == 0.0

    def test_empty(self):
        assert compute_twr([]) == 0.0

    def test_filters_non_positive(self):
        # Zeros are filtered out; only [100, 110] remain → +10%
        assert compute_twr([100, 0, 110]) == pytest.approx(0.10)


# ── CAGR ─────────────────────────────────────────────────────────────────────

class TestCAGR:
    def test_doubles_in_one_year(self):
        # (200/100)^(365/365) - 1 = 1.0
        assert compute_cagr(100, 200, 365) == pytest.approx(1.0)

    def test_quadruples_in_two_years(self):
        # (400/100)^(365/730) - 1 = 4^0.5 - 1 = 1.0 per year
        assert compute_cagr(100, 400, 730) == pytest.approx(1.0)

    def test_10_percent_gain(self):
        assert compute_cagr(100, 110, 365) == pytest.approx(0.10, rel=1e-6)

    def test_no_gain(self):
        assert compute_cagr(100, 100, 365) == pytest.approx(0.0)

    def test_zero_start(self):
        assert compute_cagr(0, 200, 365) == 0.0

    def test_zero_days(self):
        assert compute_cagr(100, 200, 0) == 0.0

    def test_negative_days(self):
        assert compute_cagr(100, 200, -1) == 0.0


# ── Daily returns ─────────────────────────────────────────────────────────────

class TestDailyReturns:
    def test_simple_up_down(self):
        result = compute_daily_returns([100, 110, 99])
        assert len(result) == 2
        assert result[0] == pytest.approx(0.10)
        assert result[1] == pytest.approx((99 - 110) / 110)

    def test_empty_input(self):
        assert compute_daily_returns([]) == []

    def test_single_value(self):
        assert compute_daily_returns([100]) == []

    def test_zero_prev_value_returns_zero(self):
        # prev=0 is invalid data — should insert 0.0 not crash
        result = compute_daily_returns([0, 100])
        assert result == [0.0]

    def test_length_one_shorter_than_input(self):
        values = [100 + i for i in range(10)]
        result = compute_daily_returns(values)
        assert len(result) == 9


# ── Period return ─────────────────────────────────────────────────────────────

class TestPeriodReturn:
    def test_basic_gain(self):
        assert compute_period_return([100, 150]) == pytest.approx(0.50)

    def test_basic_loss(self):
        assert compute_period_return([100, 80]) == pytest.approx(-0.20)

    def test_uses_first_and_last(self):
        assert compute_period_return([100, 50, 200]) == pytest.approx(1.0)

    def test_single_value(self):
        assert compute_period_return([100]) == 0.0

    def test_empty(self):
        assert compute_period_return([]) == 0.0


# ── Annualise return ──────────────────────────────────────────────────────────

class TestAnnualiseReturn:
    def test_one_year_unchanged(self):
        assert annualise_return(0.10, 365) == pytest.approx(0.10, rel=1e-6)

    def test_two_year_compounding(self):
        # Holding 10% over 2 years annualises to (1.10)^0.5 - 1
        expected = (1.10) ** (365.0 / 730) - 1.0
        assert annualise_return(0.10, 730) == pytest.approx(expected, rel=1e-6)

    def test_zero_days(self):
        assert annualise_return(0.10, 0) == 0.0


# ── MWR / IRR ─────────────────────────────────────────────────────────────────

class TestMWR:
    def test_simple_10_percent(self):
        # Deposit $100 one year ago, now worth $110 → 10% MWR
        one_year_ago = date.today() - timedelta(days=365)
        result = compute_mwr([-100], [one_year_ago], 110)
        assert result == pytest.approx(0.10, abs=0.005)

    def test_empty_flows(self):
        assert compute_mwr([], [], 100) == 0.0

    def test_mismatched_lengths(self):
        assert compute_mwr([-100, -50], [date.today()], 200) == 0.0


# ── Sharpe ratio ─────────────────────────────────────────────────────────────

class TestSharpe:
    def test_formula_correctness(self):
        returns = [0.01, -0.005, 0.02, -0.01, 0.015] * 20  # 100 points
        r = np.array(returns, dtype=float)
        expected = float(np.mean(r) / np.std(r, ddof=1) * math.sqrt(252))
        assert compute_sharpe(returns) == pytest.approx(expected, rel=1e-8)

    def test_constant_returns_zero_std(self):
        # All identical → std=0 → returns 0.0, not ZeroDivisionError
        assert compute_sharpe([0.01] * 100) == 0.0

    def test_fewer_than_3_points(self):
        assert compute_sharpe([0.01, 0.02]) == 0.0

    def test_empty(self):
        assert compute_sharpe([]) == 0.0

    def test_positive_bias_gives_positive_sharpe(self):
        returns = [0.01] * 80 + [-0.001] * 20
        assert compute_sharpe(returns) > 0

    def test_negative_bias_gives_negative_sharpe(self):
        returns = [-0.01] * 80 + [0.001] * 20
        assert compute_sharpe(returns) < 0


# ── Sortino ratio ─────────────────────────────────────────────────────────────

class TestSortino:
    def test_no_downside_returns_inf(self):
        returns = [0.01, 0.02, 0.005, 0.015] * 10
        assert compute_sortino(returns) == float("inf")

    def test_fewer_than_3_returns_zero(self):
        assert compute_sortino([0.01, 0.02]) == 0.0

    def test_mixed_returns(self):
        returns = [0.01, -0.005, 0.02, -0.01, 0.015] * 20
        result = compute_sortino(returns)
        # Should be positive (positive mean, some downside)
        assert result > 0

    def test_all_negative_gives_negative(self):
        returns = [-0.01, -0.02, -0.005] * 20
        result = compute_sortino(returns)
        assert result < 0


# ── Beta ──────────────────────────────────────────────────────────────────────

class TestBeta:
    def test_identical_series_is_one(self):
        series = [0.01, -0.005, 0.02, -0.01, 0.015] * 10
        result = compute_beta(series, series)
        assert result == pytest.approx(1.0, rel=1e-6)

    def test_double_benchmark_is_two(self):
        b = [0.01, -0.005, 0.02, -0.01, 0.015] * 10
        p = [v * 2 for v in b]
        assert compute_beta(p, b) == pytest.approx(2.0, rel=1e-6)

    def test_fewer_than_5_aligned_returns_default(self):
        assert compute_beta([1, 2, 3, 4], [1, 2, 3, 4]) == 1.0

    def test_constant_benchmark_returns_default(self):
        # var(b) = 0 → default 1.0
        assert compute_beta([0.01] * 10, [0.0] * 10) == 1.0

    def test_aligns_by_shorter_series(self):
        p = [0.01] * 10
        b = [0.01] * 20
        # Should use last 10 of b — both constant → var=0 → default 1.0
        assert compute_beta(p, b) == 1.0


# ── Alpha ─────────────────────────────────────────────────────────────────────

class TestAlpha:
    def test_outperformance(self):
        # rf=4%, β=1, bm=10%, port=12% → α = 12% - (4% + 1*(10%-4%)) = 2%
        result = compute_alpha(0.12, 0.10, 1.0, rf_annual=0.04)
        assert result == pytest.approx(0.02, rel=1e-6)

    def test_market_match_zero_alpha(self):
        result = compute_alpha(0.10, 0.10, 1.0, rf_annual=0.04)
        assert result == pytest.approx(0.0, abs=1e-10)

    def test_uses_default_rf(self):
        # Default rf = 0.045 (4.5%)
        result = compute_alpha(0.10, 0.08, 1.0)
        expected = 0.10 - (0.045 + 1.0 * (0.08 - 0.045))
        assert result == pytest.approx(expected, rel=1e-6)


# ── Max drawdown ──────────────────────────────────────────────────────────────

class TestMaxDrawdown:
    def test_20_percent_drawdown(self):
        dd, days = compute_max_drawdown([100, 90, 80, 90])
        assert dd == pytest.approx(-0.20, rel=1e-6)
        assert days == 2

    def test_50_percent_drawdown(self):
        dd, days = compute_max_drawdown([100, 50, 100])
        assert dd == pytest.approx(-0.50, rel=1e-6)
        assert days == 1

    def test_monotonically_rising_no_drawdown(self):
        dd, days = compute_max_drawdown([100, 110, 120, 130])
        assert dd == pytest.approx(0.0)
        assert days == 0

    def test_fewer_than_2_values(self):
        assert compute_max_drawdown([100]) == (0.0, 0)
        assert compute_max_drawdown([]) == (0.0, 0)

    def test_multiple_drawdowns_picks_worst(self):
        # Two drawdowns: -10% and -30%; should report -30%
        vals = [100, 90, 100, 100, 70, 100]
        dd, _ = compute_max_drawdown(vals)
        assert dd == pytest.approx(-0.30, rel=1e-6)


# ── VaR / CVaR ────────────────────────────────────────────────────────────────

class TestVaR:
    def test_fewer_than_20_returns_zero(self):
        from calculations.risk import compute_var, compute_cvar
        assert compute_var([0.01] * 19) == 0.0
        assert compute_cvar([0.01] * 19) == 0.0

    def test_all_same_return(self):
        from calculations.risk import compute_var
        returns = [-0.01] * 100
        assert compute_var(returns, confidence=0.95) == pytest.approx(-0.01)

    def test_cvar_worse_than_or_equal_to_var(self):
        from calculations.risk import compute_var, compute_cvar
        np.random.seed(42)
        returns = np.random.normal(0.001, 0.02, 200).tolist()
        var = compute_var(returns)
        cvar = compute_cvar(returns)
        assert cvar <= var  # CVaR is always at least as bad as VaR


# ── Win rate ──────────────────────────────────────────────────────────────────

class TestWinRate:
    def test_all_positive(self):
        assert compute_win_rate([0.01, 0.02, 0.03]) == pytest.approx(1.0)

    def test_all_negative(self):
        assert compute_win_rate([-0.01, -0.02]) == pytest.approx(0.0)

    def test_zero_counts_as_win(self):
        assert compute_win_rate([0.01, 0.0, -0.01]) == pytest.approx(2 / 3)

    def test_empty(self):
        assert compute_win_rate([]) == 0.0


# ── Volatility ────────────────────────────────────────────────────────────────

class TestVolatility:
    def test_constant_returns_zero_vol(self):
        assert compute_volatility([0.01, 0.01, 0.01]) == pytest.approx(0.0)

    def test_fewer_than_3_returns_zero(self):
        assert compute_volatility([0.01, 0.02]) == 0.0

    def test_annualised_formula(self):
        returns = [0.01, -0.01, 0.02, -0.02] * 25
        r = np.array(returns, dtype=float)
        expected = float(np.std(r, ddof=1) * math.sqrt(252))
        assert compute_volatility(returns) == pytest.approx(expected, rel=1e-8)


# ── Calmar ────────────────────────────────────────────────────────────────────

class TestCalmar:
    def test_basic(self):
        assert compute_calmar(0.20, -0.10) == pytest.approx(2.0)

    def test_zero_drawdown_returns_zero(self):
        assert compute_calmar(0.20, 0.0) == 0.0

    def test_positive_drawdown_returns_zero(self):
        assert compute_calmar(0.20, 0.10) == 0.0


# ── Correlation ───────────────────────────────────────────────────────────────

class TestCorrelation:
    def test_perfect_correlation(self):
        series = [0.01, -0.005, 0.02, -0.01, 0.015] * 10
        assert compute_correlation(series, series) == pytest.approx(1.0, rel=1e-6)

    def test_fewer_than_5_returns_zero(self):
        assert compute_correlation([1, 2, 3, 4], [1, 2, 3, 4]) == 0.0

    def test_anti_correlated(self):
        b = [0.01, -0.01] * 25
        p = [-v for v in b]
        assert compute_correlation(p, b) == pytest.approx(-1.0, rel=1e-6)


# ── Volatility regime ─────────────────────────────────────────────────────────

class TestVolatilityRegime:
    def test_low(self):
        assert classify_volatility_regime(0.05) == "low"

    def test_normal(self):
        assert classify_volatility_regime(0.10) == "normal"

    def test_elevated(self):
        assert classify_volatility_regime(0.20) == "elevated"

    def test_high(self):
        assert classify_volatility_regime(0.30) == "high"

    def test_boundary_normal(self):
        assert classify_volatility_regime(0.08) == "normal"  # ≥ 0.08 → normal

    def test_boundary_elevated(self):
        assert classify_volatility_regime(0.15) == "elevated"  # ≥ 0.15 → elevated


# ── Period slicing ────────────────────────────────────────────────────────────

class TestSliceByPeriod:
    def _make_series(self, n_days: int):
        now = datetime.now(tz=timezone.utc)
        timestamps = [now - timedelta(days=n_days - i) for i in range(n_days)]
        values = [100.0 + i for i in range(n_days)]
        return values, timestamps

    def test_all_returns_everything(self):
        values, ts = self._make_series(30)
        v, t = slice_by_period(values, ts, "ALL")
        assert len(v) == 30
        assert len(t) == 30

    def test_1m_returns_last_30_days(self):
        values, ts = self._make_series(60)
        v, t = slice_by_period(values, ts, "1M")
        # Should return approximately 30 of the 60 data points
        assert len(v) <= 32  # allow 2-day margin for timestamp math
        assert len(v) >= 28

    def test_falls_back_to_full_when_too_narrow(self):
        # Only 1 data point in window → fall back to all
        values = [100.0, 200.0]
        now = datetime.now(tz=timezone.utc)
        ts = [now - timedelta(days=365), now - timedelta(days=364)]
        v, t = slice_by_period(values, ts, "1D")  # 1-day window → only 1 fits
        assert len(v) == 2  # fell back to full series

    def test_empty_input(self):
        assert slice_by_period([], [], "1M") == ([], [])


# ── Asset class exposure ──────────────────────────────────────────────────────

class TestAssetClassExposure:
    _holdings = [
        {"symbol": "AAPL",    "asset_class": "equity", "market_value": 6000, "currency": "USD"},
        {"symbol": "SPY",     "asset_class": "etf",    "market_value": 2000, "currency": "USD"},
        {"symbol": "BTC-USD", "asset_class": "crypto", "market_value": 2000, "currency": "USD"},
    ]

    def test_allocations_sum_to_100(self):
        result = compute_asset_class_exposure(self._holdings, 0)
        total_pct = sum(r["allocation_pct"] for r in result)
        assert total_pct == pytest.approx(100.0, abs=0.01)

    def test_equity_is_largest(self):
        result = compute_asset_class_exposure(self._holdings, 0)
        assert result[0]["asset_class"] == "equity"
        assert result[0]["allocation_pct"] == pytest.approx(60.0)

    def test_cash_included(self):
        result = compute_asset_class_exposure(self._holdings, 2000)
        classes = {r["asset_class"] for r in result}
        assert "cash" in classes

    def test_empty_holdings(self):
        result = compute_asset_class_exposure([], 0)
        assert result == []


# ── Sector exposure ───────────────────────────────────────────────────────────

class TestSectorExposure:
    def test_unknown_sector_grouped(self):
        holdings = [
            {"symbol": "AAPL", "market_value": 5000},  # no "sector" key
            {"symbol": "MSFT", "sector": "Technology", "market_value": 5000},
        ]
        result = compute_sector_exposure(holdings)
        sectors = {r["sector"] for r in result}
        assert "Unknown" in sectors
        assert "Technology" in sectors

    def test_allocations_sum_to_100(self):
        holdings = [
            {"symbol": "AAPL", "sector": "Technology", "market_value": 6000},
            {"symbol": "JPM",  "sector": "Financials",  "market_value": 4000},
        ]
        result = compute_sector_exposure(holdings)
        assert sum(r["allocation_pct"] for r in result) == pytest.approx(100.0, abs=0.01)


# ── Concentration risk ────────────────────────────────────────────────────────

class TestConcentrationRisk:
    _holdings = [
        {"symbol": "AAPL", "market_value": 7000},
        {"symbol": "MSFT", "market_value": 2000},
        {"symbol": "GOOG", "market_value": 1000},
    ]

    def test_top3_pct(self):
        result = compute_concentration_risk(self._holdings, 10000)
        assert result["top_3_pct"] == pytest.approx(100.0)

    def test_hhi(self):
        # weights = [0.7, 0.2, 0.1]; HHI = 0.49 + 0.04 + 0.01 = 0.54
        result = compute_concentration_risk(self._holdings, 10000)
        assert result["herfindahl_index"] == pytest.approx(0.54, abs=0.01)

    def test_largest_position(self):
        result = compute_concentration_risk(self._holdings, 10000)
        assert result["largest_position"]["symbol"] == "AAPL"
        assert result["largest_position"]["allocation_pct"] == pytest.approx(70.0)

    def test_empty_returns_zeros(self):
        result = compute_concentration_risk([], 0)
        assert result["herfindahl_index"] == 0.0
        assert result["largest_position"] is None


# ── Currency exposure ─────────────────────────────────────────────────────────

class TestCurrencyExposure:
    def test_defaults_to_usd(self):
        holdings = [{"symbol": "AAPL", "market_value": 1000}]  # no "currency" key
        result = compute_currency_exposure(holdings)
        assert result[0]["currency"] == "USD"

    def test_multi_currency(self):
        holdings = [
            {"symbol": "AAPL", "currency": "USD", "market_value": 7000},
            {"symbol": "SAP",  "currency": "EUR", "market_value": 3000},
        ]
        result = compute_currency_exposure(holdings)
        assert result[0]["currency"] == "USD"
        assert result[0]["allocation_pct"] == pytest.approx(70.0)


# ── Full exposure report ──────────────────────────────────────────────────────

class TestBuildExposureReport:
    def test_structure(self):
        holdings = [
            {"symbol": "AAPL", "asset_class": "equity", "sector": "Technology",
             "currency": "USD", "market_value": 10000},
        ]
        report = build_exposure_report(holdings, 12000, 2000)
        assert "by_asset_class" in report
        assert "by_sector" in report
        assert "by_currency" in report
        assert "concentration" in report
        assert report["total_value"] == pytest.approx(12000)
        assert report["cash_value"] == pytest.approx(2000)
        assert report["invested_value"] == pytest.approx(10000)
        assert report["cash_pct"] == pytest.approx(16.67, abs=0.01)  # rounded to 2dp
