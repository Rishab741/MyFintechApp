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

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err: any) {
    console.error('ML PIPELINE ERROR:', err.message)
    return json({ error: 'Internal Server Error', message: err.message }, 500)
  }
})
