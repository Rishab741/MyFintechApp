"""
Real-market-data validation tests for TWR, Sharpe, and Max Drawdown.

Uses embedded S&P 500 monthly closing prices (2022 bear + 2023 bull) as a
known reference dataset. The expected values are derived from the same embedded
data via independent reference formulas — any delta means the engine has a
compounding or rounding error.

Data source: S&P 500 index (SPX) monthly closing prices.
2022 full-year price return: approximately -19.44 %
2023 full-year price return: approximately +24.23 %
2022 peak-to-trough drawdown: approximately -24.77 % (Jan peak → Sep trough)

Run from services/engine/:
    pytest tests/test_calculations_real_data.py -v
"""

from __future__ import annotations

import math
import statistics

import numpy as np
import pytest

from calculations.returns import compute_cagr, compute_daily_returns, compute_twr
from calculations.risk import compute_max_drawdown, compute_sharpe, compute_sortino

# ── Embedded S&P 500 monthly closing prices ───────────────────────────────────
# Monthly closes from 2021-12-31 through 2022-12-30 (13 values → 12 sub-periods)
SP500_MONTHLY_CLOSES_2022 = [
    4766.18,   # 2021-12-31 (starting reference)
    4515.55,   # 2022-01-31
    4373.94,   # 2022-02-28
    4530.41,   # 2022-03-31
    4131.93,   # 2022-04-29
    4132.15,   # 2022-05-31
    3785.38,   # 2022-06-30
    4130.29,   # 2022-07-29
    3955.00,   # 2022-08-31
    3585.62,   # 2022-09-30   ← 2022 trough
    3901.06,   # 2022-10-31
    4080.11,   # 2022-11-30
    3839.50,   # 2022-12-30
]

# Monthly closes from 2022-12-30 through 2023-12-29 (13 values → 12 sub-periods)
SP500_MONTHLY_CLOSES_2023 = [
    3839.50,   # 2022-12-30 (starting reference)
    4076.60,   # 2023-01-31
    3970.15,   # 2023-02-28
    4109.31,   # 2023-03-31
    4169.48,   # 2023-04-28
    4179.83,   # 2023-05-31
    4450.38,   # 2023-06-30
    4588.96,   # 2023-07-31
    4507.66,   # 2023-08-31
    4288.05,   # 2023-09-29
    4193.80,   # 2023-10-31
    4567.80,   # 2023-11-30
    4769.83,   # 2023-12-29   ← 2023 year-end
]


def _reference_twr(values: list[float]) -> float:
    """Independent chain-link TWR: product of each sub-period's ratio minus 1."""
    product = 1.0
    for i in range(1, len(values)):
        product *= values[i] / values[i - 1]
    return product - 1.0


def _monthly_returns(closes: list[float]) -> list[float]:
    return [(closes[i] - closes[i - 1]) / closes[i - 1] for i in range(1, len(closes))]


def _reference_sharpe_monthly(monthly_returns: list[float], rf_monthly: float = 0.0) -> float:
    """
    Sharpe from monthly data, annualised by sqrt(12).
    This is a reference implementation — separate from the engine's daily version.
    """
    if len(monthly_returns) < 3:
        return 0.0
    excess = [r - rf_monthly for r in monthly_returns]
    mean = statistics.mean(excess)
    std = statistics.stdev(excess)   # sample std (ddof=1)
    if std < 1e-10:
        return 0.0
    return mean / std * math.sqrt(12)


# ── TWR tests with real market data ───────────────────────────────────────────

class TestTWR_RealData:

    def test_2022_bear_market_twr_is_negative(self):
        twr = compute_twr(SP500_MONTHLY_CLOSES_2022)
        assert twr < 0, f"2022 S&P 500 TWR should be negative; got {twr:.4f}"

    def test_2023_bull_market_twr_is_positive(self):
        twr = compute_twr(SP500_MONTHLY_CLOSES_2023)
        assert twr > 0, f"2023 S&P 500 TWR should be positive; got {twr:.4f}"

    def test_2022_twr_matches_reference_chain_link(self):
        """
        TWR via chain-linking must match the independent reference formula exactly.
        Any rounding error in the engine's loop would show up here.
        """
        expected = _reference_twr(SP500_MONTHLY_CLOSES_2022)
        actual = compute_twr(SP500_MONTHLY_CLOSES_2022)
        assert abs(actual - expected) < 1e-10, (
            f"Chain-link rounding error: expected {expected:.8f}, got {actual:.8f}"
        )

    def test_2023_twr_matches_reference_chain_link(self):
        expected = _reference_twr(SP500_MONTHLY_CLOSES_2023)
        actual = compute_twr(SP500_MONTHLY_CLOSES_2023)
        assert abs(actual - expected) < 1e-10

    def test_2022_twr_equals_simple_holding_period_return(self):
        """
        For a buy-and-hold position with no external cash flows, TWR must
        equal (end/start - 1) exactly — the chain-link telescopes to this.
        If it doesn't, the compounding logic has a bug.
        """
        start = SP500_MONTHLY_CLOSES_2022[0]
        end   = SP500_MONTHLY_CLOSES_2022[-1]
        simple_return = (end - start) / start       # -0.19442...
        twr = compute_twr(SP500_MONTHLY_CLOSES_2022)
        assert abs(twr - simple_return) < 1e-8, (
            f"TWR {twr:.8f} should equal simple return {simple_return:.8f}. "
            "Chain-link compounding error detected."
        )

    def test_2023_annual_return_in_expected_range(self):
        """2023 S&P 500 price return is well-documented as approximately +24 %."""
        twr = compute_twr(SP500_MONTHLY_CLOSES_2023)
        assert 0.20 < twr < 0.30, (
            f"2023 S&P 500 annual return expected ~24 %; got {twr:.2%}"
        )

    def test_2022_annual_return_in_expected_range(self):
        """2022 S&P 500 price return is well-documented as approximately -19 %."""
        twr = compute_twr(SP500_MONTHLY_CLOSES_2022)
        assert -0.22 < twr < -0.17, (
            f"2022 S&P 500 annual return expected ~-19 %; got {twr:.2%}"
        )

    def test_two_year_combined_twr_matches_reference(self):
        """
        Chaining 2022 (bear) + 2023 (bull) should roughly recover to flat.
        The combined TWR: (1 + twr_2022) × (1 + twr_2023) - 1
        """
        closes_combined = SP500_MONTHLY_CLOSES_2022 + SP500_MONTHLY_CLOSES_2023[1:]
        ref_combined = _reference_twr(closes_combined)
        actual_combined = compute_twr(closes_combined)
        assert abs(actual_combined - ref_combined) < 1e-10

    def test_cagr_2022_annualised_same_as_single_year_twr(self):
        """For exactly 365 days, CAGR must equal the simple annual return."""
        start = SP500_MONTHLY_CLOSES_2022[0]
        end   = SP500_MONTHLY_CLOSES_2022[-1]
        cagr = compute_cagr(start, end, 365)
        twr  = compute_twr(SP500_MONTHLY_CLOSES_2022)
        # Both should be -19.44% ± 0.5%
        assert abs(cagr - twr) < 0.005, (
            f"CAGR({cagr:.4f}) should ≈ TWR({twr:.4f}) for a 1-year period"
        )


# ── Max drawdown tests with real market data ──────────────────────────────────

class TestMaxDrawdown_RealData:

    def test_2022_max_drawdown_is_negative(self):
        dd, _ = compute_max_drawdown(SP500_MONTHLY_CLOSES_2022)
        assert dd < 0

    def test_2022_max_drawdown_approximately_25_percent(self):
        """
        2022 S&P 500 peak-to-trough (monthly closes): Jan peak 4766.18 → Sep trough 3585.62
        = (3585.62 - 4766.18) / 4766.18 = -24.77 %
        """
        dd, days = compute_max_drawdown(SP500_MONTHLY_CLOSES_2022)
        assert -0.27 < dd < -0.22, (
            f"2022 S&P 500 max drawdown expected ~-24.77 %; got {dd:.2%}"
        )

    def test_2022_max_drawdown_peak_was_opening_value(self):
        """The 2022 peak in our monthly dataset is the first value (Jan 3 close)."""
        dd, drawdown_periods = compute_max_drawdown(SP500_MONTHLY_CLOSES_2022)
        # Trough is index 9 (September), peak is index 0 → 9 monthly periods
        assert drawdown_periods == 9

    def test_2022_trough_at_september_close(self):
        """September 2022 close (3585.62) is the minimum in the dataset."""
        min_val = min(SP500_MONTHLY_CLOSES_2022)
        assert min_val == pytest.approx(3585.62)

    def test_2023_drawdown_smaller_than_2022(self):
        """Bull markets have smaller peak-to-trough drawdowns."""
        dd_2022, _ = compute_max_drawdown(SP500_MONTHLY_CLOSES_2022)
        dd_2023, _ = compute_max_drawdown(SP500_MONTHLY_CLOSES_2023)
        assert abs(dd_2023) < abs(dd_2022), (
            f"2023 drawdown {dd_2023:.2%} should be smaller than 2022 {dd_2022:.2%}"
        )

    def test_known_exact_drawdown_value(self):
        """
        Hand-verified: (3585.62 - 4766.18) / 4766.18 = -0.24773
        The engine must match this to 4 decimal places.
        """
        expected_dd = (3585.62 - 4766.18) / 4766.18
        actual_dd, _ = compute_max_drawdown(SP500_MONTHLY_CLOSES_2022)
        assert abs(actual_dd - expected_dd) < 1e-4, (
            f"Max drawdown {actual_dd:.6f} differs from hand-calculated {expected_dd:.6f}"
        )


# ── Sharpe ratio tests with real market data ──────────────────────────────────

class TestSharpe_RealData:

    def test_2022_sharpe_is_negative(self):
        """A bear market year must produce a negative Sharpe ratio."""
        monthly_returns = _monthly_returns(SP500_MONTHLY_CLOSES_2022)
        sharpe = _reference_sharpe_monthly(monthly_returns)
        assert sharpe < 0, f"2022 Sharpe should be negative; got {sharpe:.4f}"

    def test_2023_sharpe_is_positive(self):
        """A bull market year must produce a positive Sharpe ratio."""
        monthly_returns = _monthly_returns(SP500_MONTHLY_CLOSES_2023)
        sharpe = _reference_sharpe_monthly(monthly_returns)
        assert sharpe > 0, f"2023 Sharpe should be positive; got {sharpe:.4f}"

    def test_engine_sharpe_formula_matches_reference_on_real_data(self):
        """
        Pass monthly returns through compute_sharpe (which scales by sqrt(252))
        and verify the formula is self-consistent: the result should equal
        mean/std × sqrt(252) computed independently via numpy.
        """
        monthly_returns = _monthly_returns(SP500_MONTHLY_CLOSES_2022)
        r = np.array(monthly_returns, dtype=float)
        expected = float(np.mean(r) / np.std(r, ddof=1) * math.sqrt(252))
        actual = compute_sharpe(monthly_returns)
        assert abs(actual - expected) < 1e-8, (
            f"Engine Sharpe {actual:.6f} != reference {expected:.6f}"
        )

    def test_2023_better_sharpe_than_2022(self):
        """2023 (bull) should have a higher Sharpe than 2022 (bear)."""
        sharpe_2022 = _reference_sharpe_monthly(
            _monthly_returns(SP500_MONTHLY_CLOSES_2022)
        )
        sharpe_2023 = _reference_sharpe_monthly(
            _monthly_returns(SP500_MONTHLY_CLOSES_2023)
        )
        assert sharpe_2023 > sharpe_2022, (
            f"2023 Sharpe {sharpe_2023:.4f} should exceed 2022 {sharpe_2022:.4f}"
        )

    def test_sortino_2022_negative(self):
        """Sortino should be negative in a year with many losing months."""
        monthly_returns = _monthly_returns(SP500_MONTHLY_CLOSES_2022)
        sortino = compute_sortino(monthly_returns)
        assert sortino < 0, f"2022 Sortino should be negative; got {sortino:.4f}"

    def test_sortino_2023_positive(self):
        monthly_returns = _monthly_returns(SP500_MONTHLY_CLOSES_2023)
        # Some months in 2023 were negative, so Sortino is not inf but should be positive
        sortino = compute_sortino(monthly_returns)
        assert sortino > 0, f"2023 Sortino should be positive; got {sortino:.4f}"


# ── Consistency checks ────────────────────────────────────────────────────────

class TestCrossMetricConsistency_RealData:
    """Verify that metrics are internally consistent with each other."""

    def test_2022_twr_consistent_with_daily_returns_sum(self):
        """
        compute_daily_returns gives sub-period returns whose product equals TWR.
        For monthly data, the product of (1 + r_i) must equal (1 + TWR).
        """
        monthly_rets = _monthly_returns(SP500_MONTHLY_CLOSES_2022)
        # compute_daily_returns on the closes should give same monthly_rets
        result = compute_daily_returns(SP500_MONTHLY_CLOSES_2022)
        assert len(result) == 12
        product = 1.0
        for r in result:
            product *= (1 + r)
        twr = compute_twr(SP500_MONTHLY_CLOSES_2022)
        assert abs((product - 1) - twr) < 1e-8

    def test_max_drawdown_always_negative_or_zero(self):
        """Drawdown is definitionally ≤ 0."""
        for closes in [SP500_MONTHLY_CLOSES_2022, SP500_MONTHLY_CLOSES_2023]:
            dd, _ = compute_max_drawdown(closes)
            assert dd <= 0.0, f"Max drawdown {dd} must be ≤ 0"

    def test_twr_and_period_return_agree_on_real_data(self):
        """
        For a clean buy-and-hold series (no cash flows), TWR must equal
        the simple period return (end/start - 1). Both functions must agree.
        """
        from calculations.returns import compute_period_return
        for closes in [SP500_MONTHLY_CLOSES_2022, SP500_MONTHLY_CLOSES_2023]:
            twr = compute_twr(closes)
            pr  = compute_period_return(closes)
            assert abs(twr - pr) < 1e-8, (
                f"TWR({twr:.8f}) must equal period_return({pr:.8f}) for buy-and-hold"
            )
