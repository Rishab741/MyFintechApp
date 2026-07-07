/**
 * refresh-benchmark-cache — SSOT automation for S&P 500 benchmark data
 *
 * Fetches the FRED SP500 series (monthly closing levels, last 5 years) and
 * upserts into price_cache with symbol = 'SP500'. Invoked by a pg_cron job
 * daily at 00:30 UTC — after US market close, before the ML pipeline runs.
 *
 * Why FRED instead of Yahoo Finance?
 *   FRED's SP500 series is the official Federal Reserve publication, has no
 *   IP-based rate limits, and is free. Yahoo Finance's /v8 endpoint is
 *   informal scraping that can be banned at any time.
 *
 * Deploy: npx supabase functions deploy refresh-benchmark-cache
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FRED_BASE    = 'https://api.stlouisfed.org/fred/series/observations'
const SERIES_ID    = 'SP500'   // FRED series: S&P 500 monthly index level
const FETCH_MONTHS = 72        // 6 years — enough history for any backtesting window

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  // This function is called by a service-role pg_net request or manually.
  // No user JWT required — the service role key in the Authorization header suffices.
  const fredKey = Deno.env.get('FRED_API_KEY')
  if (!fredKey) return json({ error: 'FRED_API_KEY not configured' }, 500)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // Fetch SP500 monthly observations, newest first
    const url = `${FRED_BASE}?series_id=${SERIES_ID}&api_key=${fredKey}&sort_order=desc&limit=${FETCH_MONTHS}&file_type=json`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`FRED HTTP ${res.status}`)

    const data = await res.json()
    const observations: any[] = (data.observations ?? [])
      .filter((o: any) => o.value && o.value !== '.' && o.value !== 'null')

    if (observations.length === 0) throw new Error('FRED returned zero SP500 observations')

    // Normalise to first-of-month so YYYY-MM lookups are unambiguous.
    // FRED reports the last business day of each month; we key on month only.
    const rows = observations.map((o: any) => {
      const d          = new Date(o.date)
      const firstOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
        .toISOString().split('T')[0]
      const price = parseFloat(o.value)
      return {
        symbol:      'SP500',
        date:        firstOfMonth,
        open:        price,
        high:        price,
        low:         price,
        close:       price,
        adj_close:   price,
        volume:      null,
        dividend:    0,
        split_factor: 1,
        source:      'fred',
        fetched_at:  new Date().toISOString(),
      }
    })

    const { error: upsertErr } = await supabase
      .from('price_cache')
      .upsert(rows, { onConflict: 'symbol,date' })

    if (upsertErr) throw new Error(upsertErr.message)

    const latestDate = rows[0]?.date ?? 'unknown'
    console.log(`SP500 cache refreshed: ${rows.length} months upserted, latest=${latestDate}`)

    return json({ success: true, rows_upserted: rows.length, latest_date: latestDate })

  } catch (err: any) {
    console.error('refresh-benchmark-cache ERROR:', err.message)
    return json({ error: err.message }, 500)
  }
})
