/**
 * market-intelligence — Vestara Global Macro Intelligence Engine
 *
 * Fetches live macroeconomic data from the FRED API (Federal Reserve Economic Data),
 * runs a rule-based regime-detection and signal engine, caches the result for 6 hours,
 * and returns structured intelligence for the GlobalMarkets screen.
 *
 * ─── One-time Supabase setup (run in SQL Editor) ─────────────────────────────
 * CREATE TABLE IF NOT EXISTS market_intelligence_cache (
 *   singleton_key int PRIMARY KEY DEFAULT 1 CHECK (singleton_key = 1),
 *   data          jsonb        NOT NULL,
 *   fetched_at    timestamptz  NOT NULL DEFAULT now()
 * );
 * ALTER TABLE market_intelligence_cache ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "service role only" ON market_intelligence_cache USING (false);
 *
 * ─── Set FRED API key (free at fred.stlouisfed.org/docs/api/api_key.html) ───
 * npx supabase secrets set FRED_API_KEY=your_key_here
 *
 * ─── Deploy ──────────────────────────────────────────────────────────────────
 * npx supabase functions deploy market-intelligence
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })

const CACHE_TTL_MS = 6 * 60 * 60 * 1_000   // 6 hours
const FRED_BASE    = 'https://api.stlouisfed.org/fred/series/observations'

// ── FRED helpers ──────────────────────────────────────────────────────────────

async function fredLatest(series: string, key: string, limit = 10): Promise<number | null> {
  try {
    const url = `${FRED_BASE}?series_id=${series}&api_key=${key}&sort_order=desc&limit=${limit}&file_type=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const j   = await res.json()
    const obs  = (j.observations ?? []).filter((o: any) => o.value !== '.' && o.value !== 'null' && o.value)
    return obs.length > 0 ? parseFloat(obs[0].value) : null
  } catch { return null }
}

async function fredSeries(series: string, key: string, limit: number): Promise<number[]> {
  try {
    const url = `${FRED_BASE}?series_id=${series}&api_key=${key}&sort_order=desc&limit=${limit}&file_type=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return []
    const j = await res.json()
    return (j.observations ?? [])
      .filter((o: any) => o.value !== '.' && o.value !== 'null' && o.value)
      .map((o: any) => parseFloat(o.value))
  } catch { return [] }
}

// ── Macro regime detection ─────────────────────────────────────────────────────
// Evaluates 5 macro dimensions → returns the dominant regime label

function detectRegime(
  cpiYoY:      number | null,
  fedRate:     number | null,
  yldSpread:   number | null,
  unemployment:number | null,
  vix:         number | null,
): string {
  const inf  = cpiYoY      ?? 3
  const rate = fedRate     ?? 3
  const spr  = yldSpread   ?? 0.5
  const unem = unemployment?? 4
  const fear = vix         ?? 18

  // RECESSION_RISK: inverted curve + rising unemployment
  if (spr < -0.3 && unem > 4.5) return 'RECESSION_RISK'

  // STAGFLATION: high inflation + restrictive rates + flat/inverted curve
  if (inf > 4 && rate > 4 && spr < 0.5) return 'STAGFLATION'

  // INFLATIONARY_BULL: high inflation but rates still accommodative (early-cycle mismatch)
  if (inf > 4 && rate < 3) return 'INFLATIONARY_BULL'

  // RESTRICTIVE: Fed has raised rates, inflation moderating
  if (rate > 4.5 && inf < 4) return 'RESTRICTIVE'

  // GOLDILOCKS: inflation on target, rates moderate, healthy curve
  if (inf <= 3 && rate <= 3.5 && spr > 0.5) return 'GOLDILOCKS'

  // RECOVERY: rates falling/low, improving employment
  if (rate < 3 && unem < 5 && inf < 3) return 'RECOVERY'

  return 'TRANSITIONAL'
}

// ── Regime playbooks ───────────────────────────────────────────────────────────

const REGIMES: Record<string, any> = {
  GOLDILOCKS: {
    label:         'Goldilocks',
    description:   'Low inflation, accommodative rates, healthy yield curve — the ideal equity environment.',
    color:         '#34D399',
    equity_stance: 'Strongly Overweight',
    bond_stance:   'Underweight',
    overweight: [
      { name: 'Technology',      etf: 'XLK',  reason: 'Low rates expand long-duration growth valuations' },
      { name: 'Consumer Disc.',  etf: 'XLY',  reason: 'Consumer confidence and spending are high' },
      { name: 'Industrials',     etf: 'XLI',  reason: 'Strong growth lifts cyclical capex spend' },
      { name: 'Financials',      etf: 'XLF',  reason: 'Healthy lending activity and credit quality' },
    ],
    underweight: [
      { name: 'Utilities',        etf: 'XLU',  reason: 'Defensive sectors lag in risk-on regimes' },
      { name: 'Consumer Staples', etf: 'XLP',  reason: 'Low-beta assets underperform in bull markets' },
    ],
    fixed_income: 'Equities over bonds. Moderate duration (5-7Y) if holding fixed income. Avoid excessive cash drag.',
    key_etfs: ['SPY', 'QQQ', 'VGT', 'XLY', 'XLI'],
    strategy: 'Fully invested. Growth and momentum tilt. Lean into the cycle.',
  },

  RESTRICTIVE: {
    label:         'Restrictive Policy',
    description:   'Elevated rates with moderating inflation — quality, income, and short-duration strategies outperform.',
    color:         '#C9A84C',
    equity_stance: 'Neutral',
    bond_stance:   'Short Duration Only',
    overweight: [
      { name: 'Financials',       etf: 'XLF',  reason: 'Net interest margins expand at elevated rates' },
      { name: 'Healthcare',       etf: 'XLV',  reason: 'Defensive earnings with pricing power' },
      { name: 'Consumer Staples', etf: 'XLP',  reason: 'Inelastic demand ensures earnings stability' },
      { name: 'Energy',           etf: 'XLE',  reason: 'Real asset exposure as inflationary residue persists' },
    ],
    underweight: [
      { name: 'Technology',      etf: 'XLK',  reason: 'High rates compress long-duration growth multiples' },
      { name: 'Real Estate',     etf: 'XLRE', reason: 'REITs are rate-sensitive; cap-rate expansion pressures values' },
      { name: 'Consumer Disc.',  etf: 'XLY',  reason: 'Discretionary spending weakens as debt servicing costs rise' },
    ],
    fixed_income: 'Short-duration T-bills (SHV, BIL) offer 4-5%+ with minimal risk. Avoid long bonds — duration risk is elevated.',
    key_etfs: ['SHV', 'BIL', 'XLF', 'XLV', 'XLP', 'USMV'],
    strategy: 'Quality over growth. Earnings stability over multiple expansion. Cash is a legitimate asset class here.',
  },

  STAGFLATION: {
    label:         'Stagflation Alert',
    description:   'High inflation combined with slowing growth — the most challenging environment for traditional portfolios.',
    color:         '#F87171',
    equity_stance: 'Underweight',
    bond_stance:   'TIPS Only',
    overweight: [
      { name: 'Energy',           etf: 'XLE',  reason: 'Commodity producers are direct inflation beneficiaries' },
      { name: 'Materials',        etf: 'XLB',  reason: 'Hard assets outperform in inflationary periods' },
      { name: 'Consumer Staples', etf: 'XLP',  reason: 'Inelastic demand enables inflationary price pass-through' },
    ],
    underweight: [
      { name: 'Technology',      etf: 'XLK',  reason: 'Long-duration growth assets suffer most in stagflation' },
      { name: 'Consumer Disc.',  etf: 'XLY',  reason: 'Discretionary spending collapses under cost-of-living pressure' },
      { name: 'Real Estate',     etf: 'XLRE', reason: 'Rates up + growth down = double pressure on REITs' },
    ],
    fixed_income: 'Inflation-linked bonds (SCHP, TIPS) are essential. Avoid all nominal bonds — inflation erodes real returns.',
    key_etfs: ['GLD', 'PDBC', 'XLE', 'XLB', 'SCHP', 'XLP'],
    strategy: 'Hard asset focus. Gold as portfolio anchor. Capital preservation is the primary objective.',
  },

  RECESSION_RISK: {
    label:         'Recession Risk',
    description:   'Inverted yield curve and softening employment signal elevated recession probability over the next 12-18 months.',
    color:         '#F87171',
    equity_stance: 'Defensive',
    bond_stance:   'Long Duration',
    overweight: [
      { name: 'Healthcare',       etf: 'XLV',  reason: 'Non-cyclical demand sustains earnings through downturns' },
      { name: 'Consumer Staples', etf: 'XLP',  reason: 'Essential goods maintain demand in all economic conditions' },
      { name: 'Utilities',        etf: 'XLU',  reason: 'Regulated, dividend-paying utilities provide stability' },
    ],
    underweight: [
      { name: 'Financials',      etf: 'XLF',  reason: 'Credit losses and loan demand shrinkage hurt banks' },
      { name: 'Industrials',     etf: 'XLI',  reason: 'Cyclical earnings collapse in economic contractions' },
      { name: 'Consumer Disc.',  etf: 'XLY',  reason: 'Discretionary spending is the first casualty of recession' },
    ],
    fixed_income: 'Long-duration Treasuries (IEF, TLT) as flight-to-safety. Rates may fall sharply — duration is an asset here.',
    key_etfs: ['IEF', 'TLT', 'GLD', 'XLV', 'XLP', 'XLU', 'USMV'],
    strategy: 'Capital preservation first. Maximum defensive tilt. Increase Treasury bonds and gold.',
  },

  INFLATIONARY_BULL: {
    label:         'Inflationary Growth',
    description:   'Strong growth with elevated inflation — real assets and value stocks shine while growth lags.',
    color:         '#FB923C',
    equity_stance: 'Overweight (Value)',
    bond_stance:   'Avoid Nominal Bonds',
    overweight: [
      { name: 'Energy',          etf: 'XLE',  reason: 'Oil and gas producers benefit directly from commodity inflation' },
      { name: 'Materials',       etf: 'XLB',  reason: 'Commodity prices rise faster than input costs for miners' },
      { name: 'Financials',      etf: 'XLF',  reason: 'Strong economy drives loan demand; rates will eventually rise' },
      { name: 'Real Estate',     etf: 'XLRE', reason: 'Hard assets historically track inflation over medium term' },
    ],
    underweight: [
      { name: 'Technology',  etf: 'XLK',  reason: 'Rate-sensitive growth valuations will compress as rates rise to fight inflation' },
      { name: 'Utilities',   etf: 'XLU',  reason: 'Rate increases hit regulated utility valuations' },
    ],
    fixed_income: 'TIPS (SCHP) only. Nominal bonds will be eroded by inflation. Float-rate notes (FLOT) as alternative.',
    key_etfs: ['GLD', 'XLE', 'XLB', 'SCHP', 'FLOT', 'VDE'],
    strategy: 'Value and real assets over growth. Inflation is the defining risk — hedge accordingly.',
  },

  RECOVERY: {
    label:         'Recovery Cycle',
    description:   'Rates declining, employment improving — early-cycle conditions strongly favour cyclicals and growth.',
    color:         '#34D399',
    equity_stance: 'Strongly Overweight',
    bond_stance:   'Reduce',
    overweight: [
      { name: 'Consumer Disc.',  etf: 'XLY',  reason: 'Consumer confidence and spending recover first in early cycle' },
      { name: 'Technology',      etf: 'XLK',  reason: 'Falling rates re-rate growth asset valuations higher' },
      { name: 'Industrials',     etf: 'XLI',  reason: 'Capex and manufacturing rebound as confidence returns' },
      { name: 'Financials',      etf: 'XLF',  reason: 'Loan growth accelerates with economic recovery' },
    ],
    underweight: [
      { name: 'Utilities',        etf: 'XLU',  reason: 'Defensive sectors lag as risk appetite recovers' },
      { name: 'Consumer Staples', etf: 'XLP',  reason: 'Stable but low-growth in high-risk-appetite environments' },
    ],
    fixed_income: 'Reduce bond duration aggressively. Equities will strongly outperform as rates fall.',
    key_etfs: ['SPY', 'QQQ', 'VBR', 'XLY', 'XLI', 'IWM'],
    strategy: 'Maximum equity exposure. Early-cycle playbook. Small caps often lead at this stage.',
  },

  TRANSITIONAL: {
    label:         'Transitional',
    description:   'Mixed macro signals — the dominant regime is unclear. Balance, quality, and optionality are key.',
    color:         '#4F9EF8',
    equity_stance: 'Neutral',
    bond_stance:   'Balanced',
    overweight: [
      { name: 'Healthcare',  etf: 'XLV',  reason: 'Defensive-growth hybrid works in uncertain environments' },
      { name: 'Financials',  etf: 'XLF',  reason: 'Relatively neutral to moderate macro swings' },
    ],
    underweight: [],
    fixed_income: 'Balanced duration (2-5Y). Maintain optionality. Avoid committing heavily to any one scenario.',
    key_etfs: ['USMV', 'SCHD', 'XLV', 'XLF', 'BIL'],
    strategy: 'Wait for clearer regime signals. Quality and low-volatility factor exposure. Avoid leverage.',
  },
}

// ── Macro signal engine ────────────────────────────────────────────────────────
// Generates granular investment tactic signals from individual indicator readings

function generateMacroSignals(
  cpiYoY:      number | null,
  fedRate:     number | null,
  yldSpread:   number | null,
  unemployment:number | null,
  vix:         number | null,
  yield10y:    number | null,
  yield2y:     number | null,
): any[] {
  const signals: any[] = []

  // ── INFLATION ──
  if (cpiYoY !== null) {
    if (cpiYoY > 5) {
      signals.push({
        id: 'inflation_high', category: 'inflation', severity: 'critical',
        title: 'Critically Elevated Inflation',
        body: `CPI is running at ${cpiYoY.toFixed(1)}% YoY — well above the Fed's 2% target. This level of inflation erodes purchasing power rapidly and typically forces aggressive monetary tightening, which pressures equity multiples.`,
        action: 'Rotate into inflation hedges: TIPS (SCHP), commodities (PDBC), energy (XLE), and gold (GLD). Reduce nominal long-duration bond exposure.',
        value: `${cpiYoY.toFixed(1)}% YoY CPI`,
      })
    } else if (cpiYoY > 3) {
      signals.push({
        id: 'inflation_elevated', category: 'inflation', severity: 'warning',
        title: 'Above-Target Inflation',
        body: `CPI at ${cpiYoY.toFixed(1)}% YoY is above the Fed's 2% target, keeping monetary policy in a restrictive stance. Growth assets face multiple compression pressure until inflation sustainably returns to target.`,
        action: 'Prefer value and quality over growth. Consider modest allocations to TIPS and short-duration fixed income.',
        value: `${cpiYoY.toFixed(1)}% YoY CPI`,
      })
    } else if (cpiYoY <= 2 && cpiYoY > 1) {
      signals.push({
        id: 'inflation_target', category: 'inflation', severity: 'positive',
        title: 'Inflation At Target',
        body: `CPI at ${cpiYoY.toFixed(1)}% YoY is within the Fed's 2% target range — the ideal environment for sustained equity performance without inflationary monetary tightening.`,
        action: 'Conditions support equity overweight. The Fed has room to ease if growth slows, providing a policy backstop.',
        value: `${cpiYoY.toFixed(1)}% YoY CPI`,
      })
    } else if (cpiYoY < 1) {
      signals.push({
        id: 'inflation_low', category: 'inflation', severity: 'warning',
        title: 'Below-Target Inflation Risk',
        body: `CPI at ${cpiYoY.toFixed(1)}% YoY is approaching deflationary territory. Prolonged below-target inflation can signal weak demand and may force the Fed toward emergency accommodation.`,
        action: 'Monitor for demand-side weakness. The Fed may ease policy — this would benefit long-duration bonds and growth equities.',
        value: `${cpiYoY.toFixed(1)}% YoY CPI`,
      })
    }
  }

  // ── FED RATE ──
  if (fedRate !== null) {
    if (fedRate > 5) {
      signals.push({
        id: 'rates_high', category: 'rates', severity: 'warning',
        title: 'Highly Restrictive Monetary Policy',
        body: `The Fed Funds Rate at ${fedRate.toFixed(2)}% represents the most restrictive monetary environment in over a decade. At this level, cash and short-term bonds compete directly with equities on a risk-adjusted basis.`,
        action: 'Short-duration T-bills (SHV, BIL) offer 5%+ with near-zero duration risk. Reduce equity multiple exposure. Focus on earnings yield, not growth expectations.',
        value: `${fedRate.toFixed(2)}% Fed Rate`,
      })
    } else if (fedRate > 3.5) {
      signals.push({
        id: 'rates_restrictive', category: 'rates', severity: 'neutral',
        title: 'Elevated Interest Rate Environment',
        body: `Fed Funds at ${fedRate.toFixed(2)}% creates a higher hurdle rate for equity returns. Quality companies with pricing power and strong free cash flow outperform in this environment.`,
        action: 'Prioritise earnings quality over revenue growth. Dividend-paying stocks (SCHD) offer income alongside equity exposure.',
        value: `${fedRate.toFixed(2)}% Fed Rate`,
      })
    } else if (fedRate < 2) {
      signals.push({
        id: 'rates_low', category: 'rates', severity: 'positive',
        title: 'Accommodative Rate Environment',
        body: `At ${fedRate.toFixed(2)}%, rates are sufficiently low to support equity valuations via the equity risk premium. Long-duration growth assets benefit from compressed discount rates.`,
        action: 'Growth assets (QQQ, VGT) are structurally supported. Real estate (XLRE) benefits from low financing costs. Consider reducing cash allocation.',
        value: `${fedRate.toFixed(2)}% Fed Rate`,
      })
    }
  }

  // ── YIELD CURVE ──
  if (yldSpread !== null && yield10y !== null && yield2y !== null) {
    if (yldSpread < -0.5) {
      signals.push({
        id: 'yield_curve_inverted', category: 'yield_curve', severity: 'critical',
        title: 'Deeply Inverted Yield Curve',
        body: `The 10Y-2Y spread stands at ${yldSpread.toFixed(2)}% — deeply negative. An inverted yield curve has preceded every US recession since 1955 with a typical lead time of 12-18 months. The inversion signals that markets expect the Fed to cut rates significantly in response to future economic weakness.`,
        action: 'Begin rotating toward defensive sectors (XLV, XLP, XLU). Build Treasury bond allocation (IEF) as a recession hedge. Reduce cyclical exposure.',
        value: `${yldSpread.toFixed(2)}% 10Y-2Y Spread`,
      })
    } else if (yldSpread < 0) {
      signals.push({
        id: 'yield_curve_flat', category: 'yield_curve', severity: 'warning',
        title: 'Yield Curve Inversion',
        body: `10Y-2Y spread of ${yldSpread.toFixed(2)}% indicates an inverted curve — a historically reliable recession indicator. Short-term rates exceeding long-term rates reflect expectations of future rate cuts.`,
        action: 'Begin defensive tilt in portfolio positioning. Monitor unemployment for confirmation. Start building Treasury bond allocation as asymmetric hedge.',
        value: `${yldSpread.toFixed(2)}% 10Y-2Y Spread`,
      })
    } else if (yldSpread > 1.5) {
      signals.push({
        id: 'yield_curve_steep', category: 'yield_curve', severity: 'positive',
        title: 'Steep Yield Curve',
        body: `A ${yldSpread.toFixed(2)}% 10Y-2Y spread signals a healthy economic outlook. Banks and financial intermediaries benefit most from steep yield curves through expanded net interest margins.`,
        action: 'Financial sector (XLF) is structurally positioned to outperform. Steep curves typically accompany early-to-mid cycle economic expansion.',
        value: `${yldSpread.toFixed(2)}% 10Y-2Y Spread`,
      })
    }

    if (yield10y !== null && yield10y > 5) {
      signals.push({
        id: 'long_rates_high', category: 'rates', severity: 'warning',
        title: '10Y Treasury Above 5%',
        body: `10-Year Treasury yield at ${yield10y.toFixed(2)}% creates a meaningful risk-free alternative to equities. At this level, the equity risk premium narrows significantly, making broad equity valuations look stretched.`,
        action: 'Lock in long-term Treasury yields via IEF or TLT. Assess whether equity valuations adequately compensate for the risk vs. 5%+ risk-free yields.',
        value: `${yield10y.toFixed(2)}% 10Y Yield`,
      })
    }
  }

  // ── VIX / FEAR ──
  if (vix !== null) {
    if (vix > 35) {
      signals.push({
        id: 'vix_extreme', category: 'sentiment', severity: 'critical',
        title: 'Extreme Market Fear',
        body: `VIX at ${vix.toFixed(1)} indicates panic-level fear. While uncomfortable, extreme fear readings are historically associated with market bottoms — "be greedy when others are fearful."`,
        action: 'Historically, VIX spikes above 35 create strong forward return opportunities. Consider systematic buying of quality assets in tranches (dollar-cost averaging during the spike).',
        value: `${vix.toFixed(1)} VIX`,
      })
    } else if (vix > 25) {
      signals.push({
        id: 'vix_high', category: 'sentiment', severity: 'warning',
        title: 'Elevated Market Volatility',
        body: `VIX at ${vix.toFixed(1)} is above the long-run average of ~20, reflecting meaningful market uncertainty. At this level, hedging costs are elevated and position sizing should be conservative.`,
        action: 'Reduce position sizes by 20-30% until volatility normalises. Avoid adding leverage. Consider protective puts on large positions.',
        value: `${vix.toFixed(1)} VIX`,
      })
    } else if (vix < 13) {
      signals.push({
        id: 'vix_complacency', category: 'sentiment', severity: 'neutral',
        title: 'Low Volatility — Monitor for Complacency',
        body: `VIX at ${vix.toFixed(1)} is historically low, suggesting market complacency. While low VIX is consistent with bullish conditions, it can also precede sudden volatility spikes ("volatility paradox").`,
        action: 'Consider low-cost portfolio protection (put spreads). Maintain disciplined stop-losses. Low-vol environments can end abruptly.',
        value: `${vix.toFixed(1)} VIX`,
      })
    } else if (vix < 18) {
      signals.push({
        id: 'vix_normal', category: 'sentiment', severity: 'positive',
        title: 'Healthy Volatility Environment',
        body: `VIX at ${vix.toFixed(1)} is within the normal range (13-20), indicating a healthy balance between fear and greed. Markets are functioning normally without signs of excessive complacency or panic.`,
        action: 'Volatility conditions are supportive of normal equity positioning. No special hedging required at this level.',
        value: `${vix.toFixed(1)} VIX`,
      })
    }
  }

  // ── UNEMPLOYMENT ──
  if (unemployment !== null) {
    if (unemployment > 5.5) {
      signals.push({
        id: 'unem_rising', category: 'employment', severity: 'warning',
        title: 'Labor Market Softening',
        body: `Unemployment at ${unemployment.toFixed(1)}% signals deteriorating labor market conditions. Rising unemployment typically leads to reduced consumer spending, lower corporate earnings, and increased recession probability.`,
        action: 'Rotate away from consumer discretionary and cyclicals. Increase defensive allocations. This is a leading indicator to watch closely.',
        value: `${unemployment.toFixed(1)}% Unemployment`,
      })
    } else if (unemployment < 3.5) {
      signals.push({
        id: 'unem_tight', category: 'employment', severity: 'neutral',
        title: 'Tight Labor Market — Wage Inflation Watch',
        body: `Unemployment at ${unemployment.toFixed(1)}% represents near-full employment. While positive for consumer spending, this level creates wage inflation pressure that can force the Fed to maintain restrictive policy longer.`,
        action: 'Monitor wage growth (ECI). Tight labor markets support consumer spending but extend the period of restrictive monetary policy.',
        value: `${unemployment.toFixed(1)}% Unemployment`,
      })
    } else {
      signals.push({
        id: 'unem_healthy', category: 'employment', severity: 'positive',
        title: 'Healthy Employment',
        body: `Unemployment at ${unemployment.toFixed(1)}% represents full employment without excessive wage inflation pressure. This is the ideal labour market backdrop for sustained equity performance.`,
        action: 'Consumer-oriented sectors (XLY, XLP) benefit from healthy employment. No immediate labour-market concerns to hedge.',
        value: `${unemployment.toFixed(1)}% Unemployment`,
      })
    }
  }

  // Sort: critical → warning → positive → neutral
  const order: Record<string, number> = { critical: 0, warning: 1, positive: 2, neutral: 3 }
  signals.sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4))

  return signals
}

// ── Sector ETF list (mirrors src/market/service.ts SECTOR_ETFS) ───────────────
const SECTOR_ETF_SYMBOLS = ['XLK','XLF','XLV','XLE','XLI','XLY','XLP','XLRE','XLB','XLU','XLC']
const SECTOR_ETF_NAMES: Record<string, string> = {
  XLK: 'Technology', XLF: 'Financials', XLV: 'Healthcare',
  XLE: 'Energy',     XLI: 'Industrials', XLY: 'Cons. Disc.',
  XLP: 'Cons. Staples', XLRE: 'Real Estate', XLB: 'Materials',
  XLU: 'Utilities',  XLC: 'Comm. Svcs',
}

// Fetch sector ETF change percentages using the v8 chart API (per-symbol, query2).
// The v7 batch quote API on query1 is blocked from Deno edge servers.
// The v8 chart endpoint on query2 is the same API Yahoo Finance uses for its own
// web charts — it works from server-side and has separate rate limits.
async function fetchOneSector(etf: string): Promise<{ etf: string; changePct: number; price: number }> {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${etf}?interval=1d&range=2d`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return { etf, changePct: 0, price: 0 }
    const json = await res.json()
    const meta = json?.chart?.result?.[0]?.meta
    if (!meta) return { etf, changePct: 0, price: 0 }
    const prev: number = meta.chartPreviousClose ?? meta.previousClose ?? 0
    const curr: number = meta.regularMarketPrice ?? 0
    const changePct = prev > 0 ? ((curr - prev) / prev) * 100 : 0
    return { etf, changePct, price: curr }
  } catch {
    return { etf, changePct: 0, price: 0 }
  }
}

async function fetchSectorQuotes(): Promise<Array<{ name: string; etf: string; changePct: number; price: number }>> {
  const settled = await Promise.allSettled(SECTOR_ETF_SYMBOLS.map(fetchOneSector))
  return SECTOR_ETF_SYMBOLS
    .map((etf, i) => {
      const r = settled[i]
      const val = r.status === 'fulfilled' ? r.value : { etf, changePct: 0, price: 0 }
      return { name: SECTOR_ETF_NAMES[etf] ?? etf, etf, changePct: val.changePct, price: val.price }
    })
    .sort((a, b) => b.changePct - a.changePct)
}

// ── Edge function entry ───────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Check macro cache (6h TTL) ──
  // Sector quotes are fetched fresh every time (cached separately for 5 min
  // so rapid refreshes don't hammer Yahoo Finance).
  let cachedMacro: any = null
  let cacheAgeMs  = Infinity
  try {
    const { data: cached } = await supabaseAdmin
      .from('market_intelligence_cache')
      .select('data, fetched_at')
      .eq('singleton_key', 1)
      .single()

    if (cached) {
      cacheAgeMs = Date.now() - new Date(cached.fetched_at).getTime()
      if (cacheAgeMs < CACHE_TTL_MS) {
        cachedMacro = cached.data
      }
    }
  } catch {
    // cache table may not exist yet — continue to fresh fetch
  }

  // Fetch sectors in parallel (always fresh — 5-min server cache via headers)
  const sectorsPromise = fetchSectorQuotes()

  if (cachedMacro) {
    // Macro is fresh from cache; still return live sector quotes
    const sectors = await sectorsPromise
    return json({
      ...(cachedMacro as object),
      sectors,
      cached: true,
      cache_age_min: Math.round(cacheAgeMs / 60_000),
    })
  }

  // ── FRED API key check ──
  const fredKey = Deno.env.get('FRED_API_KEY')
  if (!fredKey) {
    // Still return sectors even without FRED key so sector screen works
    const sectors = await sectorsPromise
    return json({
      needs_setup: true,
      sectors,
      setup_instructions: [
        '1. Get a free FRED API key at: https://fred.stlouisfed.org/docs/api/api_key.html',
        '2. Run: npx supabase secrets set FRED_API_KEY=your_key',
        '3. Run: npx supabase functions deploy market-intelligence',
        '4. Run the SQL in the file header to create the cache table',
      ],
    }, 200)
  }

  // ── Fetch macro + sectors in parallel ──
  const [
    [cpiSeries, fedRate, unemployment, yield10y, yield2y, vix],
    sectors,
  ] = await Promise.all([
    Promise.all([
      fredSeries('CPIAUCSL', fredKey, 14),   // 14 months — need 13 for YoY + 1 buffer
      fredLatest('FEDFUNDS', fredKey, 3),
      fredLatest('UNRATE',   fredKey, 3),
      fredLatest('DGS10',    fredKey, 10),   // daily — needs buffer for weekends
      fredLatest('DGS2',     fredKey, 10),
      fredLatest('VIXCLS',   fredKey, 10),
    ]),
    sectorsPromise,
  ])

  // ── CPI year-over-year ──
  let cpiYoY:     number | null = null
  const cpiCurrent: number | null = cpiSeries.length > 0 ? cpiSeries[0] : null
  if (cpiSeries.length >= 13) {
    cpiYoY = ((cpiSeries[0] - cpiSeries[12]) / cpiSeries[12]) * 100
  }

  const yieldSpread = (yield10y !== null && yield2y !== null) ? yield10y - yield2y : null

  // ── Regime detection ──
  const regimeId   = detectRegime(cpiYoY, fedRate, yieldSpread, unemployment, vix)
  const regimeData = REGIMES[regimeId] ?? REGIMES['TRANSITIONAL']

  // ── Generate signals ──
  const signals = generateMacroSignals(cpiYoY, fedRate, yieldSpread, unemployment, vix, yield10y, yield2y)

  const result = {
    needs_setup: false,
    macro: {
      cpi_yoy:      cpiYoY     !== null ? +cpiYoY.toFixed(2)     : null,
      cpi_level:    cpiCurrent !== null ? +cpiCurrent.toFixed(1)  : null,
      fed_rate:     fedRate    !== null ? +fedRate.toFixed(2)     : null,
      unemployment: unemployment!== null? +unemployment.toFixed(1): null,
      yield_10y:    yield10y  !== null ? +yield10y.toFixed(2)    : null,
      yield_2y:     yield2y   !== null ? +yield2y.toFixed(2)     : null,
      yield_spread: yieldSpread!== null ? +yieldSpread.toFixed(2) : null,
      vix:          vix        !== null ? +vix.toFixed(1)         : null,
    },
    regime: { id: regimeId, ...regimeData },
    signals,
    sectors,
    fetched_at: new Date().toISOString(),
    cached: false,
    cache_age_min: 0,
  }

  // ── Persist macro to cache (sectors not cached — always fresh) ──
  try {
    // Store without sectors in cache so they are always re-fetched live
    const { sectors: _s, ...cachePayload } = result
    await supabaseAdmin
      .from('market_intelligence_cache')
      .upsert({ singleton_key: 1, data: cachePayload, fetched_at: new Date().toISOString() })
  } catch {
    // Non-fatal — table may not exist
  }

  return json(result)
})
