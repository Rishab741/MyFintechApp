import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ── S&P 500 monthly reference values (same dict as Portfolio.tsx) ──────────────
const SP500: Record<string, number> = {
  '2023-10': 4194, '2023-11': 4568, '2023-12': 4769,
  '2024-01': 4845, '2024-02': 5137, '2024-03': 5254, '2024-04': 5035,
  '2024-05': 5277, '2024-06': 5460, '2024-07': 5522, '2024-08': 5648,
  '2024-09': 5762, '2024-10': 5705, '2024-11': 6032, '2024-12': 5882,
  '2025-01': 6059, '2025-02': 5954, '2025-03': 5600,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getUnits(p: any): number {
  return p.units ?? p.quantity ?? 0
}

function getTicker(symbol: any): string {
  if (!symbol) return '???'
  if (typeof symbol === 'string') return symbol
  if (typeof symbol === 'object') {
    if (symbol.raw_symbol) return String(symbol.raw_symbol)
    if (symbol.symbol)     return getTicker(symbol.symbol)
    if (symbol.id)         return String(symbol.id)
  }
  return 'Asset'
}

function getCurrency(raw: any): string {
  if (!raw) return 'USD'
  if (typeof raw === 'string') return raw.length >= 3 ? raw : 'USD'
  if (typeof raw === 'object') return raw.code ?? raw.id ?? 'USD'
  return 'USD'
}

function snapshotTotalValue(snap: any): number {
  const positions = snap?.positions ?? []
  const balances  = snap?.balances  ?? []
  return positions.reduce((s: number, p: any) => s + getUnits(p) * (p.price ?? 0), 0)
       + balances.reduce((s: number, b: any)  => s + (b.cash ?? 0), 0)
}

function sp500ForDate(dateStr: string): number {
  const d   = new Date(dateStr)
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return SP500[key] ?? SP500['2025-03']
}

function rollingStd(values: number[], window: number, idx: number): number {
  if (idx < window - 1) return 0
  const slice = values.slice(idx - window + 1, idx + 1)
  const mean  = slice.reduce((a, b) => a + b, 0) / slice.length
  const vari  = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / slice.length
  return Math.sqrt(vari)
}

function momentum(returns: number[], idx: number, window: number): number {
  if (idx < window) return 0
  return returns.slice(idx - window + 1, idx + 1).reduce((a, b) => a + b, 0)
}

function drawdownAt(values: number[], idx: number): number {
  if (idx === 0) return 0
  const peak = Math.max(...values.slice(0, idx + 1))
  return peak > 0 ? ((values[idx] - peak) / peak) * 100 : 0
}

// ── Portfolio-level feature computation ──────────────────────────────────────
function buildFeatureRows(rows: any[]): any[] {
  if (rows.length < 2) return []

  const totalValues = rows.map(r => snapshotTotalValue(r.snapshot))

  // daily returns (%) between consecutive snapshots
  const dailyReturns: number[] = totalValues.map((v, i) =>
    i === 0 || totalValues[i - 1] === 0 ? 0 : ((v - totalValues[i - 1]) / totalValues[i - 1]) * 100
  )

  // cumulative return vs first snapshot
  const base = totalValues[0] || 1

  return rows.map((row, i) => {
    const snap       = row.snapshot ?? {}
    const positions  = snap.positions ?? []
    const balances   = snap.balances  ?? []
    const totalValue = totalValues[i]
    const cash       = balances.reduce((s: number, b: any) => s + (b.cash ?? 0), 0)
    const cashPct    = totalValue > 0 ? (cash / totalValue) * 100 : 0
    const sp500Val   = sp500ForDate(row.captured_at)
    const benchBase  = sp500ForDate(rows[0].captured_at) || 1

    const benchReturn = ((sp500Val - benchBase) / benchBase) * 100
    const cumReturn   = base > 0 ? ((totalValue - base) / base) * 100 : 0

    // forward labels — only available when next rows exist
    const nextReturn1 = i + 1 < totalValues.length && totalValues[i] > 0
      ? ((totalValues[i + 1] - totalValues[i]) / totalValues[i]) * 100 : null
    const nextReturn3 = i + 3 < totalValues.length && totalValues[i] > 0
      ? ((totalValues[i + 3] - totalValues[i]) / totalValues[i]) * 100 : null

    const rollingVol7  = rollingStd(dailyReturns, 7,  i)
    const rollingVol14 = rollingStd(dailyReturns, 14, i)
    const mom5         = momentum(dailyReturns, i, 5)
    const dd           = drawdownAt(totalValues, i)
    const alpha        = i > 0
      ? dailyReturns[i] - (sp500Val > 0 && sp500ForDate(rows[i - 1]?.captured_at) > 0
          ? ((sp500Val - sp500ForDate(rows[i - 1].captured_at)) / sp500ForDate(rows[i - 1].captured_at)) * 100
          : 0)
      : 0

    // volatility regime: low / medium / high
    const volatilityRegime = rollingVol14 < 1 ? 'low' : rollingVol14 < 2.5 ? 'medium' : 'high'

    return {
      timestamp:         row.captured_at,
      total_value:       totalValue,
      positions_count:   positions.length,
      cash,
      cash_pct:          cashPct,
      daily_return:      dailyReturns[i],
      cumulative_return: cumReturn,
      rolling_vol_7:     rollingVol7,
      rolling_vol_14:    rollingVol14,
      momentum_5:        mom5,
      drawdown:          dd,
      benchmark_return:  benchReturn,
      alpha,
      // forward labels
      next_return_1:     nextReturn1,
      next_return_3:     nextReturn3,
      direction_1:       nextReturn1 !== null ? (nextReturn1 >= 0 ? 1 : 0) : null,
      direction_3:       nextReturn3 !== null ? (nextReturn3 >= 0 ? 1 : 0) : null,
      volatility_regime: volatilityRegime,
    }
  })
}

// ── Position-level feature computation ───────────────────────────────────────
function buildPositionRows(rows: any[]): any[] {
  const result: any[] = []
  for (const row of rows) {
    const snap      = row.snapshot ?? {}
    const positions = snap.positions ?? []
    const balances  = snap.balances  ?? []
    const totalVal  = snapshotTotalValue(snap)

    for (const p of positions) {
      const ticker  = getTicker(p.symbol)
      const units   = getUnits(p)
      const price   = p.price ?? 0
      const value   = units * price
      const pnl     = p.open_pnl ?? 0
      const allocPct = totalVal > 0 ? (value / totalVal) * 100 : 0
      const pnlPct  = pnl !== 0 && (value - pnl) > 0 ? (pnl / (value - pnl)) * 100 : 0
      const currency = getCurrency(p.currency ?? balances[0]?.currency)

      result.push({
        timestamp:    row.captured_at,
        ticker,
        units,
        price,
        value,
        pnl,
        pnl_pct:      pnlPct,
        alloc_pct:    allocPct,
        currency,
        type:         p.type ?? null,
        description:  p.description ?? null,
      })
    }
  }
  return result
}

// ── CSV serialisation ─────────────────────────────────────────────────────────
function toCSV(rows: any[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines   = rows.map(row =>
    headers.map(h => {
      const v = row[h]
      if (v === null || v === undefined) return ''
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')
  )
  return [headers.join(','), ...lines].join('\n')
}

// ── Edge function entry ───────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { action, user_id } = body

    if (!user_id) return json({ error: 'user_id required' }, 400)

    // Use service role key so we can bypass RLS when reading portfolio_snapshots
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ══════════════════════════════════════════════════════════════════════════
    // generate_dataset — fetch snapshots, compute features, persist to ml_datasets
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'generate_dataset') {
      const { data: snapshots, error: snapErr } = await supabaseAdmin
        .from('portfolio_snapshots')
        .select('snapshot, captured_at')
        .eq('user_id', user_id)
        .order('captured_at', { ascending: true })
        .limit(200)

      if (snapErr) return json({ error: 'Failed to fetch snapshots', details: snapErr.message }, 500)
      if (!snapshots || snapshots.length < 2) {
        return json({ error: 'Not enough snapshots (minimum 2 required)' }, 422)
      }

      const featureRows  = buildFeatureRows(snapshots)
      const positionRows = buildPositionRows(snapshots)

      // Compute summary stats
      const totalValues  = snapshots.map(s => snapshotTotalValue(s.snapshot))
      const dailyReturns = totalValues.slice(1).map((v, i) =>
        totalValues[i] > 0 ? ((v - totalValues[i]) / totalValues[i]) * 100 : 0
      )
      const mean      = dailyReturns.length
        ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0
      const vari      = dailyReturns.length
        ? dailyReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dailyReturns.length : 0
      const stddev    = Math.sqrt(vari)
      const annStd    = stddev * Math.sqrt(252)
      const sharpe    = stddev > 0 ? (mean / stddev) * Math.sqrt(252) : 0
      const sorted    = [...dailyReturns].sort((a, b) => a - b)
      const var95     = sorted[Math.floor(dailyReturns.length * 0.05)] ?? 0
      const winRate   = dailyReturns.length
        ? (dailyReturns.filter(r => r >= 0).length / dailyReturns.length) * 100 : 0
      const firstVal  = totalValues[0] || 1
      const lastVal   = totalValues[totalValues.length - 1]
      const totalReturn = ((lastVal - firstVal) / firstVal) * 100
      const maxDD     = Math.min(...featureRows.map(r => r.drawdown), 0)

      const summary = {
        total_snapshots:    snapshots.length,
        portfolio_feature_rows: featureRows.length,
        position_feature_rows:  positionRows.length,
        date_range: {
          from: snapshots[0].captured_at,
          to:   snapshots[snapshots.length - 1].captured_at,
        },
        risk: { sharpe, ann_vol: annStd, var95, win_rate: winRate },
        total_return:      totalReturn,
        max_drawdown:      maxDD,
        feature_columns:   featureRows.length ? Object.keys(featureRows[0]) : [],
        position_columns:  positionRows.length ? Object.keys(positionRows[0]) : [],
      }

      const { error: insertErr } = await supabaseAdmin
        .from('ml_datasets')
        .insert({
          user_id,
          total_snapshots: snapshots.length,
          feature_rows:    featureRows,
          position_rows:   positionRows,
          summary,
        })

      if (insertErr) return json({ error: 'Failed to save dataset', details: insertErr.message }, 500)

      return json({ success: true, summary })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // export_csv — return CSV of portfolio-level features
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'export_csv') {
      const { data, error } = await supabaseAdmin
        .from('ml_datasets')
        .select('feature_rows, generated_at')
        .eq('user_id', user_id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) return json({ error: 'No dataset found. Run generate_dataset first.' }, 404)

      const csv = toCSV(data.feature_rows as any[])
      return new Response(csv, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="portfolio_features.csv"',
        },
      })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // export_positions_csv — return CSV of position-level features
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'export_positions_csv') {
      const { data, error } = await supabaseAdmin
        .from('ml_datasets')
        .select('position_rows, generated_at')
        .eq('user_id', user_id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) return json({ error: 'No dataset found. Run generate_dataset first.' }, 404)

      const csv = toCSV(data.position_rows as any[])
      return new Response(csv, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="position_features.csv"',
        },
      })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // get_dataset_info — return metadata about the latest dataset
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'get_dataset_info') {
      const { data, error } = await supabaseAdmin
        .from('ml_datasets')
        .select('id, generated_at, total_snapshots, summary')
        .eq('user_id', user_id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (error || !data) return json({ error: 'No dataset found. Run generate_dataset first.' }, 404)

      const summary = data.summary as any
      return json({
        id:              data.id,
        generated_at:    data.generated_at,
        total_snapshots: data.total_snapshots,
        date_range:      summary?.date_range ?? null,
        portfolio_feature_rows: summary?.portfolio_feature_rows ?? 0,
        position_feature_rows:  summary?.position_feature_rows  ?? 0,
        feature_columns:  summary?.feature_columns  ?? [],
        position_columns: summary?.position_columns ?? [],
        risk:             summary?.risk ?? null,
        total_return:     summary?.total_return ?? null,
        max_drawdown:     summary?.max_drawdown ?? null,
      })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // get_insights — rule-based expert system over the latest ml_datasets row
    // Returns: health score (0-100), labelled signals, summary stats, top positions
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'get_insights') {
      const { data, error: dsErr } = await supabaseAdmin
        .from('ml_datasets')
        .select('feature_rows, position_rows, summary, generated_at')
        .eq('user_id', user_id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (dsErr || !data) return json({ error: 'No dataset found. Generate a dataset first via generate_dataset.' }, 404)

      const featureRows  = (data.feature_rows  as any[]) ?? []
      const positionRows = (data.position_rows as any[]) ?? []
      const summary      = data.summary as any

      if (featureRows.length === 0) return json({ error: 'Dataset has no feature rows.' }, 422)

      const latestRow = featureRows[featureRows.length - 1]

      // ── Destructure summary risk stats ───────────────────────────────────
      const { sharpe = 0, ann_vol = 0, var95 = 0, win_rate = 0 } = summary?.risk ?? {}
      const max_drawdown      = summary?.max_drawdown      ?? 0
      const momentum_5        = latestRow.momentum_5        ?? 0
      const cash_pct          = latestRow.cash_pct          ?? 0
      const positions_count   = latestRow.positions_count   ?? 0
      const rolling_vol_14    = latestRow.rolling_vol_14    ?? 0
      const alpha             = latestRow.alpha             ?? 0
      const cumulative_return = latestRow.cumulative_return ?? 0
      const benchmark_return  = latestRow.benchmark_return  ?? 0
      const volatility_regime = latestRow.volatility_regime ?? 'medium'

      // ── Health Score (0-100, base 50) ────────────────────────────────────
      let score = 50

      if      (sharpe >  1.5) score += 20
      else if (sharpe >  1.0) score += 12
      else if (sharpe >  0.5) score +=  6
      else if (sharpe < -0.5) score -= 30
      else if (sharpe <  0.0) score -= 20

      if      (alpha >  3) score += 15
      else if (alpha >  1) score +=  8
      else if (alpha >  0) score +=  3
      else if (alpha < -3) score -= 20
      else if (alpha < -1) score -= 10

      if      (max_drawdown > -5)  score += 10
      else if (max_drawdown > -10) score +=  5
      else if (max_drawdown > -20) score +=  0
      else if (max_drawdown > -30) score -= 10
      else                          score -= 20

      if      (win_rate > 60) score += 10
      else if (win_rate > 50) score +=  5
      else if (win_rate < 40) score -= 10

      if      (var95 > -1) score +=  5
      else if (var95 > -2) score +=  3
      else if (var95 < -5) score -= 10
      else if (var95 < -3) score -=  5

      if      (momentum_5 >  3) score +=  5
      else if (momentum_5 >  0) score +=  2
      else if (momentum_5 < -5) score -=  5
      else if (momentum_5 <  0) score -=  2

      if (cash_pct >= 5 && cash_pct <= 25) score += 5
      else if (cash_pct > 40)               score -= 3
      else if (cash_pct < 2 && positions_count > 0) score -= 3

      if      (ann_vol < 15) score +=  5
      else if (ann_vol > 40) score -= 10
      else if (ann_vol > 30) score -=  5

      const healthScore   = Math.max(0, Math.min(100, Math.round(score)))
      const healthLabel   = healthScore >= 80 ? 'Excellent' : healthScore >= 65 ? 'Good' : healthScore >= 50 ? 'Fair' : healthScore >= 35 ? 'Poor' : 'Critical'
      const healthTagline = healthScore >= 80 ? 'Portfolio operating at peak efficiency' : healthScore >= 65 ? 'Strong risk-adjusted performance' : healthScore >= 50 ? 'Room for strategic improvement' : healthScore >= 35 ? 'Risk management attention required' : 'Immediate portfolio review recommended'

      // ── Signal engine ─────────────────────────────────────────────────────
      const signals: any[] = []
      const cumulAlpha = cumulative_return - benchmark_return

      // RISK: Annualised volatility
      if (ann_vol > 30) {
        signals.push({
          id: 'risk_high_vol', category: 'risk',
          severity: ann_vol > 40 ? 'critical' : 'warning',
          title: 'High Annualised Volatility',
          body: `Annualised volatility of ${ann_vol.toFixed(1)}% is ${ann_vol > 40 ? 'critically ' : ''}above the typical 20% threshold, amplifying both gains and drawdowns.`,
          action: 'Review high-beta positions. Add defensive allocations or reduce sizing on the most volatile holdings.',
          value: `${ann_vol.toFixed(1)}% Ann. Vol`,
        })
      } else if (ann_vol < 8 && positions_count > 0) {
        signals.push({
          id: 'risk_low_vol', category: 'risk', severity: 'positive',
          title: 'Low Portfolio Volatility',
          body: `Annualised volatility of ${ann_vol.toFixed(1)}% reflects a stable, well-managed portfolio with excellent risk containment.`,
          action: 'Maintain current sizing. Monitor for market regime shifts that may require re-calibration.',
          value: `${ann_vol.toFixed(1)}% Ann. Vol`,
        })
      }

      // RISK: Maximum drawdown
      if (max_drawdown < -25) {
        signals.push({
          id: 'risk_drawdown', category: 'risk', severity: 'critical',
          title: 'Significant Peak Drawdown',
          body: `Maximum drawdown of ${max_drawdown.toFixed(1)}% represents a severe peak-to-trough decline. Recovery requires outsized future gains (e.g., a 33% loss needs a 50% gain to recover).`,
          action: 'Reassess position sizing and risk per trade. Implement stop-loss levels on large positions.',
          value: `${max_drawdown.toFixed(1)}% Max DD`,
        })
      } else if (max_drawdown < -12) {
        signals.push({
          id: 'risk_drawdown_warn', category: 'risk', severity: 'warning',
          title: 'Notable Drawdown Detected',
          body: `A ${Math.abs(max_drawdown).toFixed(1)}% peak-to-trough drawdown has been recorded. Risk management thresholds should be reviewed before further capital deployment.`,
          action: 'Set drawdown-based triggers as future rebalancing and de-risking signals.',
          value: `${max_drawdown.toFixed(1)}% Max DD`,
        })
      }

      // RISK: VaR
      if (var95 < -3) {
        signals.push({
          id: 'risk_var', category: 'risk',
          severity: var95 < -5 ? 'critical' : 'warning',
          title: 'Elevated Value at Risk',
          body: `95% VaR of ${var95.toFixed(2)}% means on a typical bad day you could lose more than ${Math.abs(var95).toFixed(2)}% of portfolio value. Tail risk is elevated.`,
          action: 'Consider hedging strategies or reducing portfolio beta. Options or inverse ETFs can provide downside protection.',
          value: `${var95.toFixed(2)}% VaR (95%)`,
        })
      }

      // RISK: Short-term vol spike
      if (rolling_vol_14 > 3) {
        signals.push({
          id: 'risk_vol_spike', category: 'risk', severity: 'warning',
          title: 'Short-Term Volatility Spike',
          body: `14-day rolling volatility at ${rolling_vol_14.toFixed(2)}% signals a short-term expansion — often preceding or accompanying trend reversals.`,
          action: 'Temporarily reduce position sizes until volatility normalises. Avoid new speculative entries in this regime.',
          value: `${rolling_vol_14.toFixed(2)}% 14d Vol`,
        })
      }

      // RISK: Volatility regime
      if (volatility_regime === 'high') {
        signals.push({
          id: 'regime_high', category: 'risk', severity: 'warning',
          title: 'High Volatility Regime Active',
          body: 'The portfolio is in a high-volatility regime (14d vol > 2.5%). Historically associated with elevated drawdown risk and momentum reversals.',
          action: 'Reduce exposure. Favour quality and defensive names. Avoid leverage until the regime normalises.',
          value: 'High Vol Regime',
        })
      } else if (volatility_regime === 'low') {
        signals.push({
          id: 'regime_low', category: 'strategy', severity: 'positive',
          title: 'Low Volatility Regime',
          body: 'Current low-volatility regime is historically favourable for trend-following and growth-oriented equity strategies.',
          action: 'Conditions are supportive for deploying capital into higher-growth positions.',
          value: 'Low Vol Regime',
        })
      }

      // MOMENTUM
      if (momentum_5 > 5) {
        signals.push({
          id: 'mom_strong', category: 'momentum', severity: 'positive',
          title: 'Strong 5-Day Momentum',
          body: `Portfolio has gained ${momentum_5.toFixed(2)}% over 5 days — momentum is firmly positive and trend-following signals are bullish.`,
          action: 'Hold or modestly add to trending positions. Avoid premature profit-taking in a momentum-driven market.',
          value: `+${momentum_5.toFixed(2)}% 5d Mom`,
        })
      } else if (momentum_5 < -5) {
        signals.push({
          id: 'mom_neg', category: 'momentum', severity: 'warning',
          title: 'Negative 5-Day Momentum',
          body: `Portfolio is down ${Math.abs(momentum_5).toFixed(2)}% over 5 days. Negative momentum can persist — the "momentum crash" effect is well-documented in financial research.`,
          action: 'Assess whether declines are fundamental or sentiment-driven. Consider partial de-risking until momentum stabilises.',
          value: `${momentum_5.toFixed(2)}% 5d Mom`,
        })
      }

      // STRATEGY: Sharpe
      if (sharpe > 1.5) {
        signals.push({
          id: 'strat_sharpe_exc', category: 'strategy', severity: 'positive',
          title: 'Excellent Risk-Adjusted Returns',
          body: `Sharpe ratio of ${sharpe.toFixed(2)} is institutional-grade — you are generating strong returns for every unit of risk. Most active funds target Sharpe > 1.`,
          action: 'Your strategy is working. Maintain discipline, avoid over-trading, and document your thesis per position.',
          value: `${sharpe.toFixed(2)} Sharpe`,
        })
      } else if (sharpe > 0.5) {
        signals.push({
          id: 'strat_sharpe_good', category: 'strategy', severity: 'positive',
          title: 'Good Risk-Adjusted Returns',
          body: `Sharpe ratio of ${sharpe.toFixed(2)} is above average for retail portfolios — you are being compensated well for the risk taken.`,
          action: 'Trim underperformers and reallocate to high-Sharpe positions to compound the advantage.',
          value: `${sharpe.toFixed(2)} Sharpe`,
        })
      } else if (sharpe < 0) {
        signals.push({
          id: 'strat_sharpe_neg', category: 'strategy',
          severity: sharpe < -0.5 ? 'critical' : 'warning',
          title: 'Negative Risk-Adjusted Return',
          body: `Sharpe of ${sharpe.toFixed(2)} means you are accepting risk without adequate return — a T-bill would outperform on a risk-adjusted basis.`,
          action: 'Fundamentally review portfolio strategy. Identify which positions drag performance and reassess each risk/reward thesis.',
          value: `${sharpe.toFixed(2)} Sharpe`,
        })
      }

      // STRATEGY: Win rate
      if (win_rate > 60) {
        signals.push({
          id: 'strat_win_high', category: 'strategy', severity: 'positive',
          title: 'High Consistency Rate',
          body: `${win_rate.toFixed(1)}% of portfolio days are positive — strong consistency indicating disciplined position management.`,
          action: 'Maintain discipline. Ensure average wins exceed average losses to maximise expected value.',
          value: `${win_rate.toFixed(1)}% Win Rate`,
        })
      } else if (win_rate < 40) {
        signals.push({
          id: 'strat_win_low', category: 'strategy', severity: 'warning',
          title: 'Below-Average Win Rate',
          body: `Only ${win_rate.toFixed(1)}% of portfolio days are positive, indicating inconsistency or holding through extended drawdowns.`,
          action: 'Tighten risk management. Size positions relative to conviction level. Cut losers faster.',
          value: `${win_rate.toFixed(1)}% Win Rate`,
        })
      }

      // BENCHMARK: Cumulative alpha
      if (cumulAlpha > 5) {
        signals.push({
          id: 'bench_out', category: 'benchmark', severity: 'positive',
          title: 'Outperforming S&P 500',
          body: `Portfolio has generated ${cumulAlpha.toFixed(1)}% alpha vs the S&P 500. Fewer than 15% of active managers consistently beat the index — this is a meaningful achievement.`,
          action: 'Identify which positions and decisions drove outperformance — these represent your edge. Document and systematise them.',
          value: `+${cumulAlpha.toFixed(1)}% vs S&P 500`,
        })
      } else if (cumulAlpha < -5) {
        signals.push({
          id: 'bench_under', category: 'benchmark', severity: 'warning',
          title: 'Trailing the S&P 500',
          body: `Portfolio is underperforming the S&P 500 by ${Math.abs(cumulAlpha).toFixed(1)}%. Persistent underperformance suggests active management is not adding value over passive indexing.`,
          action: 'Consider increasing passive index exposure (SPY/VOO) while reducing underperforming active positions.',
          value: `${cumulAlpha.toFixed(1)}% vs S&P 500`,
        })
      }

      // ALLOCATION: Cash
      if (cash_pct > 35) {
        signals.push({
          id: 'alloc_cash_high', category: 'allocation', severity: 'neutral',
          title: 'Elevated Cash Drag',
          body: `${cash_pct.toFixed(1)}% in cash is a meaningful drag on returns, particularly in inflationary environments where cash loses real purchasing power.`,
          action: 'Identify high-conviction entry points. If none exist, consider short-duration treasuries or money-market funds for yield.',
          value: `${cash_pct.toFixed(1)}% Cash`,
        })
      } else if (cash_pct < 2 && positions_count > 0) {
        signals.push({
          id: 'alloc_cash_low', category: 'allocation', severity: 'warning',
          title: 'No Cash Buffer',
          body: `With only ${cash_pct.toFixed(1)}% in cash you have no dry powder for dislocations or to meet redemptions without forced selling.`,
          action: 'Trim 3-5% from your largest position to build a defensive reserve.',
          value: `${cash_pct.toFixed(1)}% Cash`,
        })
      }

      // ALLOCATION: Diversification
      if (positions_count === 1) {
        signals.push({
          id: 'alloc_conc_max', category: 'allocation', severity: 'critical',
          title: 'Maximum Concentration Risk',
          body: 'Entire portfolio is in a single position — the highest possible idiosyncratic risk. A single adverse event could be catastrophic.',
          action: 'Diversify across at least 5-8 uncorrelated positions immediately. No single position should exceed 25-30% of portfolio value.',
          value: '1 position',
        })
      } else if (positions_count <= 3) {
        signals.push({
          id: 'alloc_low_div', category: 'allocation', severity: 'warning',
          title: 'Limited Diversification',
          body: `${positions_count} positions provide minimal diversification. Company-specific risk (earnings misses, management changes, regulatory actions) is significantly elevated.`,
          action: 'Broaden to 8-15 positions across different sectors and asset classes to reduce idiosyncratic risk without diluting returns.',
          value: `${positions_count} positions`,
        })
      } else if (positions_count > 20) {
        signals.push({
          id: 'alloc_over_div', category: 'allocation', severity: 'neutral',
          title: 'Possible Over-Diversification',
          body: `${positions_count} positions risk "diworsification" — marginal holdings dilute returns without meaningfully reducing portfolio risk, approximating a high-fee index fund.`,
          action: 'Audit each position for its marginal contribution. Remove low-conviction or sector-redundant holdings.',
          value: `${positions_count} positions`,
        })
      }

      // ALLOCATION: Single-position concentration check across position rows
      const latestPosTimestamp = positionRows.length > 0
        ? [...positionRows].sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp))[0].timestamp
        : null
      const currentPositions = latestPosTimestamp
        ? positionRows.filter((p: any) => p.timestamp === latestPosTimestamp)
        : []

      if (currentPositions.length > 1) {
        const maxAlloc = Math.max(...currentPositions.map((p: any) => p.alloc_pct ?? 0))
        if (maxAlloc > 50) {
          const topPos = currentPositions.find((p: any) => (p.alloc_pct ?? 0) === maxAlloc)
          signals.push({
            id: 'alloc_single_conc', category: 'allocation',
            severity: maxAlloc > 70 ? 'critical' : 'warning',
            title: 'Single-Position Concentration',
            body: `${topPos?.ticker ?? 'One position'} represents ${maxAlloc.toFixed(1)}% of the portfolio — heavy concentration in one asset significantly magnifies idiosyncratic risk.`,
            action: `Scale out of ${topPos?.ticker ?? 'this position'} gradually toward a 25-30% target weight.`,
            value: `${maxAlloc.toFixed(1)}% — ${topPos?.ticker ?? 'top holding'}`,
          })
        }
      }

      // Sort: critical → warning → positive → neutral
      const sevOrder: Record<string, number> = { critical: 0, warning: 1, positive: 2, neutral: 3 }
      signals.sort((a, b) => (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4))

      // ── Top positions ─────────────────────────────────────────────────
      const topPositions = [...currentPositions]
        .sort((a: any, b: any) => (b.alloc_pct ?? 0) - (a.alloc_pct ?? 0))
        .slice(0, 5)
        .map((p: any) => ({
          ticker:    p.ticker,
          alloc_pct: +(p.alloc_pct ?? 0).toFixed(2),
          pnl_pct:   +(p.pnl_pct   ?? 0).toFixed(2),
          value:     +(p.value      ?? 0).toFixed(2),
        }))

      return json({
        health_score:   healthScore,
        health_label:   healthLabel,
        health_tagline: healthTagline,
        signals,
        summary: {
          sharpe:            +sharpe.toFixed(2),
          alpha:             +alpha.toFixed(2),
          win_rate:          +win_rate.toFixed(1),
          ann_vol:           +ann_vol.toFixed(1),
          var95:             +var95.toFixed(2),
          max_drawdown:      +max_drawdown.toFixed(1),
          total_return:      +(summary?.total_return ?? 0).toFixed(2),
          momentum_5:        +momentum_5.toFixed(2),
          cash_pct:          +cash_pct.toFixed(1),
          positions_count:   +positions_count,
          volatility_regime,
          benchmark_return:  +benchmark_return.toFixed(2),
          cumulative_return: +cumulative_return.toFixed(2),
        },
        top_positions: topPositions,
        generated_at:  data.generated_at,
      })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // get_recommendations — Gemini-powered AI stock/ETF/FX suggestion engine
    // Reads the latest ml_datasets row, builds a portfolio context prompt,
    // calls Gemini 1.5 Flash, and returns 5 structured investment picks.
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'get_recommendations') {
      const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
      if (!GEMINI_KEY) return json({ error: 'GEMINI_API_KEY secret not configured in Supabase.' }, 500)

      // ── Fetch latest dataset ──────────────────────────────────────────────
      const { data, error: dsErr } = await supabaseAdmin
        .from('ml_datasets')
        .select('feature_rows, position_rows, summary, generated_at')
        .eq('user_id', user_id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (dsErr || !data) return json({ error: 'No dataset found. Generate a dataset first via generate_dataset.' }, 404)

      const featureRows  = (data.feature_rows  as any[]) ?? []
      const positionRows = (data.position_rows as any[]) ?? []
      const summary      = data.summary as any

      if (featureRows.length === 0) return json({ error: 'Dataset has no feature rows.' }, 422)

      const latestRow = featureRows[featureRows.length - 1]

      // ── Extract metrics ───────────────────────────────────────────────────
      const { sharpe = 0, ann_vol = 0, var95 = 0, win_rate = 0 } = summary?.risk ?? {}
      const max_drawdown      = summary?.max_drawdown ?? 0
      const total_return      = summary?.total_return ?? 0
      const momentum_5        = latestRow.momentum_5        ?? 0
      const cash_pct          = latestRow.cash_pct          ?? 0
      const positions_count   = latestRow.positions_count   ?? 0
      const volatility_regime = latestRow.volatility_regime ?? 'medium'
      const cumulative_return = latestRow.cumulative_return ?? 0
      const benchmark_return  = latestRow.benchmark_return  ?? 0
      const alpha             = cumulative_return - benchmark_return

      // ── Current holdings summary ──────────────────────────────────────────
      const latestPosTimestamp = positionRows.length > 0
        ? [...positionRows].sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp))[0].timestamp
        : null
      const currentPositions = latestPosTimestamp
        ? positionRows.filter((p: any) => p.timestamp === latestPosTimestamp)
        : []

      const holdingsSummary = currentPositions.length > 0
        ? currentPositions
            .sort((a: any, b: any) => (b.alloc_pct ?? 0) - (a.alloc_pct ?? 0))
            .slice(0, 8)
            .map((p: any) =>
              `${p.ticker} (${(p.alloc_pct ?? 0).toFixed(1)}% alloc, P&L ${(p.pnl_pct ?? 0).toFixed(1)}%)`
            )
            .join('; ')
        : 'No position data available'

      // ── Derive implied risk profile ───────────────────────────────────────
      const riskProfile = ann_vol > 30 ? 'aggressive' : ann_vol > 15 ? 'moderate' : 'conservative'

      // ── Build prompt ──────────────────────────────────────────────────────
      const prompt = `You are a quantitative financial analyst AI. Analyse the portfolio below and suggest 5 investments.

PORTFOLIO METRICS:
- Sharpe Ratio: ${sharpe.toFixed(2)}
- Annualised Volatility: ${ann_vol.toFixed(1)}%
- Max Drawdown: ${max_drawdown.toFixed(1)}%
- Total Return: ${total_return.toFixed(1)}%
- 5-Day Momentum: ${momentum_5.toFixed(2)}%
- Cash Position: ${cash_pct.toFixed(1)}%
- Win Rate: ${win_rate.toFixed(1)}%
- VaR (95%): ${var95.toFixed(2)}%
- Volatility Regime: ${volatility_regime}
- vs S&P 500 Alpha: ${alpha >= 0 ? '+' : ''}${alpha.toFixed(1)}%
- Positions Count: ${positions_count}
- Implied Risk Profile: ${riskProfile}

CURRENT HOLDINGS:
${holdingsSummary}

TASK: Based on this specific portfolio's metrics, risk profile, and gaps, suggest exactly 5 investments (can be stocks, ETFs, currencies, or crypto) that would complement this portfolio.

Return ONLY a valid JSON object with this structure:
{
  "recommendations": [
    {
      "ticker": "e.g. AAPL, SPY, BTC-USD, EUR/USD",
      "name": "Full instrument name",
      "type": "stock|etf|forex|crypto",
      "action": "strong_buy|buy|watch",
      "rationale": "1-2 sentences on why given the portfolio metrics above",
      "risk_level": "low|medium|high",
      "conviction_score": 0-100,
      "category": "e.g. Growth, Dividend, Hedge, Diversification, Momentum, Income",
      "fit": "1 sentence on how it specifically addresses this portfolio's weaknesses or gaps"
    }
  ],
  "analyst_note": "2-3 sentence strategic overview for this specific portfolio"
}`

      // ── Call Gemini 1.5 Flash ─────────────────────────────────────────────
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2000,
              thinkingConfig: { thinkingBudget: 0 },
            },
          }),
        }
      )

      if (!geminiRes.ok) {
        const errText = await geminiRes.text()
        console.error('GEMINI ERROR', geminiRes.status, errText)
        return json({ error: 'Gemini API error', status: geminiRes.status, details: errText }, 502)
      }

      const geminiData = await geminiRes.json()

      // Gemini 2.5 with thinking=0: pick the non-thought part, fallback to last part
      const parts   = geminiData?.candidates?.[0]?.content?.parts ?? []
      const rawText = (parts.find((p: any) => !p.thought)?.text ?? parts[parts.length - 1]?.text ?? '') as string
      console.log('GEMINI RAW', rawText.slice(0, 200))

      if (!rawText) return json({ error: 'Gemini returned empty response', raw: geminiData }, 502)

      // Extract the JSON object directly — handles fenced and unfenced responses
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return json({ error: 'No JSON object found in Gemini response', raw: rawText.slice(0, 500) }, 502)

      let parsed: any
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        return json({ error: 'Failed to parse Gemini response', raw: rawText.slice(0, 500) }, 502)
      }

      return json({
        recommendations: parsed.recommendations ?? [],
        analyst_note:    parsed.analyst_note    ?? '',
        generated_at:    new Date().toISOString(),
        model:           'gemini-2.5-flash',
        portfolio_context: {
          risk_profile:       riskProfile,
          volatility_regime,
          positions_count,
          alpha: +alpha.toFixed(2),
        },
      })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err: any) {
    console.error('ML PIPELINE ERROR:', err.message)
    return json({ error: 'Internal Server Error', message: err.message }, 500)
  }
})
