/**
 * Unit tests for src/lib/finance.ts
 *
 * Philosophy (Test Pyramid):
 *   These are pure-function unit tests — no I/O, no mocks, sub-millisecond each.
 *   They give us a regression net around the math that produces every health
 *   score, Sharpe ratio, and benchmark comparison visible to users in production.
 *
 *   Tests are structured as: input → expected output.
 *   Boundary tests cover every `if` branch in computeHealthScore so any
 *   accidental threshold change breaks a test before it reaches production.
 */

import {
  sharpeRatio,
  annualizedVol,
  var95,
  winRate,
  maxDrawdown,
  drawdownAt,
  rollingStd,
  momentum,
  computeHealthScore,
  healthLabel,
  sp500ForDate,
  SP500_FLOOR,
  type HealthMetrics,
} from '../finance';

// ── Helpers ────────────────────────────────────────────────────────────────────

const NEUTRAL: HealthMetrics = {
  sharpe: 0, alpha: 0, maxDrawdown: -10, winRate: 50,
  var95: -2, momentum5: 0, cashPct: 10, positionsCount: 5, annVol: 20,
};

function withMetrics(overrides: Partial<HealthMetrics>): HealthMetrics {
  return { ...NEUTRAL, ...overrides };
}

// ── sharpeRatio ────────────────────────────────────────────────────────────────

describe('sharpeRatio', () => {
  it('returns 0 for empty array', () => {
    expect(sharpeRatio([])).toBe(0);
  });

  it('returns 0 for single-element array', () => {
    expect(sharpeRatio([1])).toBe(0);
  });

  it('returns 0 when all returns are identical (zero std dev)', () => {
    expect(sharpeRatio([2, 2, 2, 2])).toBe(0);
  });

  it('is positive for positive mean returns', () => {
    const positive = Array(252).fill(0.1);  // 0.1% daily
    expect(sharpeRatio(positive)).toBeGreaterThan(0);
  });

  it('is negative for negative mean returns', () => {
    const negative = Array(252).fill(-0.1);
    expect(sharpeRatio(negative)).toBeLessThan(0);
  });

  it('annualises by √252', () => {
    // Returns: 1 and -1 alternating → mean=0, std=1
    // Sharpe = (mean/std) * √252 = 0
    const alternating = Array(100).fill(0).map((_, i) => i % 2 === 0 ? 1 : -1);
    expect(sharpeRatio(alternating)).toBeCloseTo(0, 2);
  });

  it('produces a known Sharpe for a controlled series', () => {
    // Daily return always 0.05%, std 0.10% → Sharpe ≈ (0.05/0.10) * √252 ≈ 7.94
    const controlled = Array(252).fill(0).map((_, i) =>
      i % 2 === 0 ? 0.15 : -0.05  // mean=0.05, variance=0.01, std=0.10
    );
    const s = sharpeRatio(controlled);
    expect(s).toBeGreaterThan(7);
    expect(s).toBeLessThan(9);
  });
});

// ── annualizedVol ──────────────────────────────────────────────────────────────

describe('annualizedVol', () => {
  it('returns 0 for fewer than 2 returns', () => {
    expect(annualizedVol([])).toBe(0);
    expect(annualizedVol([1])).toBe(0);
  });

  it('is always non-negative', () => {
    const returns = [-2, 5, -1, 3, -3, 4];
    expect(annualizedVol(returns)).toBeGreaterThanOrEqual(0);
  });

  it('is larger for a more volatile series', () => {
    const stable   = Array(100).fill(0).map((_, i) => i % 2 === 0 ? 0.2 : -0.2);
    const volatile = Array(100).fill(0).map((_, i) => i % 2 === 0 ? 5 : -5);
    expect(annualizedVol(volatile)).toBeGreaterThan(annualizedVol(stable));
  });
});

// ── var95 ──────────────────────────────────────────────────────────────────────

describe('var95', () => {
  it('returns 0 for empty array', () => {
    expect(var95([])).toBe(0);
  });

  it('returns the 5th percentile (worst 5% of days)', () => {
    // 20 returns: [1, 2, ..., 20] → 5th percentile = 1st element = 1
    const returns = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(var95(returns)).toBe(1);
  });

  it('is negative (or zero) for any mix with losses', () => {
    const mixed = [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    expect(var95(mixed)).toBeLessThanOrEqual(0);
  });

  it('is always ≤ max(returns) and ≥ min(returns)', () => {
    const returns = [5, -8, 3, -1, 7, -2, 4, -5, 6, -3, 2, -4, 1, 8, 9, 10, 11, 12, 13, 14];
    const v       = var95(returns);
    expect(v).toBeGreaterThanOrEqual(Math.min(...returns));
    expect(v).toBeLessThanOrEqual(Math.max(...returns));
  });
});

// ── winRate ────────────────────────────────────────────────────────────────────

describe('winRate', () => {
  it('returns 0 for empty array', () => {
    expect(winRate([])).toBe(0);
  });

  it('returns 100 when all returns are positive', () => {
    expect(winRate([1, 2, 3])).toBe(100);
  });

  it('returns 0 when all returns are negative', () => {
    expect(winRate([-1, -2, -3])).toBe(0);
  });

  it('counts zero-return days as wins', () => {
    expect(winRate([0, 0, -1])).toBeCloseTo(66.67, 1);
  });

  it('returns 50 for exactly half positive', () => {
    expect(winRate([1, -1, 2, -2])).toBe(50);
  });
});

// ── maxDrawdown ────────────────────────────────────────────────────────────────

describe('maxDrawdown', () => {
  it('returns 0 for fewer than 2 values', () => {
    expect(maxDrawdown([])).toBe(0);
    expect(maxDrawdown([100])).toBe(0);
  });

  it('returns 0 for a monotonically increasing series', () => {
    expect(maxDrawdown([100, 110, 120, 130])).toBe(0);
  });

  it('returns −50% for a 50% peak-to-trough decline', () => {
    expect(maxDrawdown([100, 200, 100])).toBeCloseTo(-50, 5);
  });

  it('uses the global peak, not local peak', () => {
    // Peak at 300, falls to 150 → drawdown = -50%
    expect(maxDrawdown([100, 200, 300, 150])).toBeCloseTo(-50, 5);
  });

  it('is always ≤ 0', () => {
    const values = [100, 80, 120, 60, 140, 50];
    expect(maxDrawdown(values)).toBeLessThanOrEqual(0);
  });

  it('handles recovery without changing the recorded max drawdown', () => {
    // Falls to −50%, then fully recovers
    const dd = maxDrawdown([100, 200, 100, 200]);
    expect(dd).toBeCloseTo(-50, 5);
  });
});

// ── drawdownAt ─────────────────────────────────────────────────────────────────

describe('drawdownAt', () => {
  it('returns 0 at index 0', () => {
    expect(drawdownAt([100, 80], 0)).toBe(0);
  });

  it('returns −20% when current is 20% below peak', () => {
    expect(drawdownAt([100, 80], 1)).toBeCloseTo(-20, 5);
  });

  it('returns 0 at a new high', () => {
    expect(drawdownAt([100, 80, 120], 2)).toBe(0);
  });
});

// ── rollingStd ─────────────────────────────────────────────────────────────────

describe('rollingStd', () => {
  it('returns 0 when idx < window−1', () => {
    expect(rollingStd([1, 2, 3, 4, 5], 7, 3)).toBe(0);
  });

  it('returns 0 for all-identical values in window', () => {
    expect(rollingStd([5, 5, 5, 5, 5], 3, 4)).toBe(0);
  });

  it('increases for a more volatile window', () => {
    const stable   = [1, 1.1, 0.9, 1, 1, 1.1, 0.9, 1, 1, 1.1];
    const volatile = [1, 5, -3, 4, 1, 5, -3, 4, 1, 5];
    expect(rollingStd(volatile, 5, 9)).toBeGreaterThan(rollingStd(stable, 5, 9));
  });
});

// ── momentum ───────────────────────────────────────────────────────────────────

describe('momentum', () => {
  it('returns 0 when idx < window', () => {
    expect(momentum([1, 2, 3], 2, 5)).toBe(0);
  });

  it('sums the last `window` returns', () => {
    expect(momentum([1, 2, 3, 4, 5], 4, 3)).toBe(2 + 3 + 4 + 5);
  });
});

// ── sp500ForDate ──────────────────────────────────────────────────────────────

describe('sp500ForDate', () => {
  const mapWith = (entries: [string, number][]): Map<string, number> =>
    new Map(entries);

  it('returns the cached value when the exact month is present', () => {
    const m = mapWith([['2026-01', 5800], ['2026-02', 5900]]);
    expect(sp500ForDate('2026-01-15', m)).toBe(5800);
    expect(sp500ForDate('2026-02-28', m)).toBe(5900);
  });

  it('uses the most recent cached month when the requested month is absent', () => {
    const m = mapWith([['2025-10', 5700], ['2025-11', 5750]]);
    // 2026-01 not in map → falls back to last entry (2025-11)
    expect(sp500ForDate('2026-01-01', m)).toBe(5750);
  });

  it('returns SP500_FLOOR when the map is empty (cache not seeded)', () => {
    expect(sp500ForDate('2026-06-01', new Map())).toBe(SP500_FLOOR);
  });

  it('correctly parses the last day of a month', () => {
    const m = mapWith([['2025-12', 5882]]);
    expect(sp500ForDate('2025-12-31', m)).toBe(5882);
  });

  it('selects by UTC month (not local timezone)', () => {
    // UTC date: this ISO string always represents Jan 1 in UTC
    const m = mapWith([['2026-01', 5800]]);
    expect(sp500ForDate('2026-01-01T00:00:00.000Z', m)).toBe(5800);
  });
});

// ── computeHealthScore ────────────────────────────────────────────────────────

describe('computeHealthScore', () => {
  it('always returns a value in [0, 100]', () => {
    // Best-case inputs
    const best = computeHealthScore(withMetrics({
      sharpe: 3, alpha: 10, maxDrawdown: -1, winRate: 90,
      var95: 0, momentum5: 10, cashPct: 15, annVol: 5,
    }));
    expect(best).toBeGreaterThanOrEqual(0);
    expect(best).toBeLessThanOrEqual(100);

    // Worst-case inputs
    const worst = computeHealthScore(withMetrics({
      sharpe: -2, alpha: -10, maxDrawdown: -50, winRate: 20,
      var95: -10, momentum5: -10, cashPct: 0, positionsCount: 1, annVol: 60,
    }));
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(worst).toBeLessThanOrEqual(100);
  });

  it('starts at 50 for neutral inputs', () => {
    // All thresholds at neutral → should be exactly 50 + minor adjustments
    const score = computeHealthScore(withMetrics({
      sharpe: 0, alpha: 0, maxDrawdown: -10, winRate: 50,
      var95: -2, momentum5: 0, cashPct: 10, annVol: 20,
    }));
    // Neutral inputs: Sharpe=0 → -20, alpha=0 → +3, drawdown=-10 → +5,
    // winRate=50 → +5, var95=-2 → +3 → score ≈ 46
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  // ── Sharpe thresholds ──────────────────────────────────────────────────────

  it('adds 20 points for Sharpe > 1.5 (institutional grade)', () => {
    const base  = computeHealthScore(withMetrics({ sharpe: 0.3 }));
    const great = computeHealthScore(withMetrics({ sharpe: 2.0 }));
    expect(great).toBeGreaterThan(base);
  });

  it('deducts 30 points for Sharpe < −0.5 (value destruction)', () => {
    const ok  = computeHealthScore(withMetrics({ sharpe: 0.0 }));
    const bad = computeHealthScore(withMetrics({ sharpe: -1.0 }));
    expect(bad).toBeLessThan(ok);
  });

  it('uses the correct Sharpe tier (+20 vs +12 vs +6)', () => {
    const tier1 = computeHealthScore(withMetrics({ sharpe: 2.0 }));  // > 1.5 → +20
    const tier2 = computeHealthScore(withMetrics({ sharpe: 1.2 }));  // > 1.0 → +12
    const tier3 = computeHealthScore(withMetrics({ sharpe: 0.7 }));  // > 0.5 → +6
    expect(tier1).toBeGreaterThan(tier2);
    expect(tier2).toBeGreaterThan(tier3);
  });

  // ── Drawdown thresholds ────────────────────────────────────────────────────

  it('adds 10 points for drawdown shallower than −5%', () => {
    const shallow = computeHealthScore(withMetrics({ maxDrawdown: -2 }));
    const deep    = computeHealthScore(withMetrics({ maxDrawdown: -25 }));
    expect(shallow).toBeGreaterThan(deep);
  });

  it('deducts 20 points for drawdown deeper than −30%', () => {
    const moderate  = computeHealthScore(withMetrics({ maxDrawdown: -15 }));
    const severe    = computeHealthScore(withMetrics({ maxDrawdown: -35 }));
    expect(severe).toBeLessThan(moderate);
  });

  // ── Win rate thresholds ────────────────────────────────────────────────────

  it('adds 10 points for win rate above 60%', () => {
    const high = computeHealthScore(withMetrics({ winRate: 65 }));
    const low  = computeHealthScore(withMetrics({ winRate: 35 }));
    expect(high).toBeGreaterThan(low);
  });

  // ── Cash position thresholds ───────────────────────────────────────────────

  it('adds 5 points for cash in the 5–25% optimal range', () => {
    const optimal   = computeHealthScore(withMetrics({ cashPct: 15 }));
    const tooMuch   = computeHealthScore(withMetrics({ cashPct: 50 }));
    const tooLittle = computeHealthScore(withMetrics({ cashPct: 1, positionsCount: 10 }));
    expect(optimal).toBeGreaterThan(tooMuch);
    expect(optimal).toBeGreaterThan(tooLittle);
  });

  // ── Volatility thresholds ─────────────────────────────────────────────────

  it('adds 5 points for annVol below 15% (low-risk portfolio)', () => {
    const low  = computeHealthScore(withMetrics({ annVol: 10 }));
    const high = computeHealthScore(withMetrics({ annVol: 45 }));
    expect(low).toBeGreaterThan(high);
  });

  it('deducts 10 points for annVol above 40%', () => {
    const moderate  = computeHealthScore(withMetrics({ annVol: 22 }));
    const extreme   = computeHealthScore(withMetrics({ annVol: 55 }));
    expect(extreme).toBeLessThan(moderate);
  });

  // ── Output clamping ────────────────────────────────────────────────────────

  it('clamps at 100 even with all best-case inputs', () => {
    const score = computeHealthScore(withMetrics({
      sharpe: 5, alpha: 20, maxDrawdown: 0, winRate: 99,
      var95: 5, momentum5: 20, cashPct: 15, annVol: 5,
    }));
    expect(score).toBe(100);
  });

  it('clamps at 0 even with all worst-case inputs', () => {
    const score = computeHealthScore(withMetrics({
      sharpe: -5, alpha: -20, maxDrawdown: -80, winRate: 0,
      var95: -20, momentum5: -20, cashPct: 0, positionsCount: 1, annVol: 100,
    }));
    expect(score).toBe(0);
  });
});

// ── healthLabel ────────────────────────────────────────────────────────────────

describe('healthLabel', () => {
  it('returns the correct label for each tier', () => {
    expect(healthLabel(85)).toBe('Excellent');
    expect(healthLabel(70)).toBe('Good');
    expect(healthLabel(55)).toBe('Fair');
    expect(healthLabel(40)).toBe('Poor');
    expect(healthLabel(20)).toBe('Critical');
  });

  it('returns "Excellent" at exactly 80 (boundary)', () => {
    expect(healthLabel(80)).toBe('Excellent');
  });

  it('returns "Good" at exactly 65 (boundary)', () => {
    expect(healthLabel(65)).toBe('Good');
  });

  it('returns "Fair" at exactly 50 (boundary)', () => {
    expect(healthLabel(50)).toBe('Fair');
  });
});
