/**
 * sync-exchange — fetch live balances from exchange API key connections
 * and write a portfolio_snapshots row in the same HoldingsData format
 * that the SnapTrade path already uses.
 *
 * POST /functions/v1/sync-exchange
 * Auth: Bearer <user JWT>  (user_id extracted from token — never from body)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin':  Deno.env.get('ALLOWED_ORIGIN') ?? 'https://platstock.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function getUser(authHeader: string) {
  if (!authHeader.startsWith('Bearer ')) return null
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7))
  return error ? null : user
}

// ── Binance / Binance.US ──────────────────────────────────────────────────────

async function binanceHmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Stablecoins we treat as USD cash instead of positions
const STABLECOINS = new Set(['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'FDUSD', 'USDP', 'USDS'])

async function syncBinance(
  apiKey: string,
  apiSecret: string,
  base: string,
): Promise<{ positions: any[]; cashUSD: number; error?: string }> {
  const ts      = Date.now().toString()
  const payload = `timestamp=${ts}`
  const sig     = await binanceHmac(apiSecret, payload)

  const res = await fetch(`${base}/api/v3/account?${payload}&signature=${sig}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { positions: [], cashUSD: 0, error: err.msg ?? `HTTP ${res.status}` }
  }

  const acct   = await res.json()
  const raw: { asset: string; free: string; locked: string }[] = acct.balances ?? []
  const nonZero = raw.filter(b => parseFloat(b.free) + parseFloat(b.locked) > 0.000001)

  if (nonZero.length === 0) return { positions: [], cashUSD: 0 }

  // Batch-fetch all public prices in one call (no auth required)
  let priceMap = new Map<string, number>()
  try {
    const pr = await fetch(`${base}/api/v3/ticker/price`)
    if (pr.ok) {
      const tickers: { symbol: string; price: string }[] = await pr.json()
      for (const t of tickers) priceMap.set(t.symbol, parseFloat(t.price))
    }
  } catch { /* proceed without prices — values will show as 0 */ }

  const positions: any[] = []
  let cashUSD = 0

  for (const b of nonZero) {
    const qty = parseFloat(b.free) + parseFloat(b.locked)

    if (STABLECOINS.has(b.asset)) {
      cashUSD += qty
      continue
    }

    // Prefer USDT pair; fall back to BUSD or USD
    const price = priceMap.get(`${b.asset}USDT`)
      ?? priceMap.get(`${b.asset}BUSD`)
      ?? priceMap.get(`${b.asset}USD`)
      ?? 0

    positions.push({
      symbol:      b.asset,
      description: b.asset,
      units:       qty,
      quantity:    qty,
      price,
      currency:    'USD',
      type:        'crypto',
      open_pnl:    0,
    })
  }

  return { positions, cashUSD }
}

// ── Kraken ────────────────────────────────────────────────────────────────────
// Kraken uses HMAC-SHA512; the nonce is a monotonically increasing integer.

async function krakenHmac(
  apiSecret: string,
  path: string,
  nonce: string,
  postData: string,
): Promise<string> {
  // message = SHA256(nonce + postData) then HMAC-SHA512(decoded_secret, path + sha256message)
  const sha256Input = new TextEncoder().encode(nonce + postData)
  const sha256Buf   = await crypto.subtle.digest('SHA-256', sha256Input)

  const secretBytes = Uint8Array.from(atob(apiSecret), c => c.charCodeAt(0))
  const hmacKey     = await crypto.subtle.importKey(
    'raw', secretBytes,
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  )
  const pathBytes = new TextEncoder().encode(path)
  const msg       = new Uint8Array(pathBytes.length + sha256Buf.byteLength)
  msg.set(pathBytes, 0)
  msg.set(new Uint8Array(sha256Buf), pathBytes.length)

  const sig = await crypto.subtle.sign('HMAC', hmacKey, msg)
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

async function syncKraken(
  apiKey: string,
  apiSecret: string,
): Promise<{ positions: any[]; cashUSD: number; error?: string }> {
  const nonce    = Date.now().toString()
  const path     = '/0/private/Balance'
  const postData = `nonce=${nonce}`
  let sig: string

  try {
    sig = await krakenHmac(apiSecret, path, nonce, postData)
  } catch (e) {
    return { positions: [], cashUSD: 0, error: 'Invalid Kraken API secret format (must be base64)' }
  }

  const res = await fetch(`https://api.kraken.com${path}`, {
    method:  'POST',
    headers: {
      'API-Key':  apiKey,
      'API-Sign': sig,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: postData,
  })

  if (!res.ok) return { positions: [], cashUSD: 0, error: `Kraken HTTP ${res.status}` }

  const data = await res.json()
  if (data.error?.length) return { positions: [], cashUSD: 0, error: data.error.join(', ') }

  const balances: Record<string, string> = data.result ?? {}

  // Kraken asset names: XXBT = BTC, XETH = ETH, ZUSD = USD, etc.
  const KRAKEN_NAME: Record<string, string> = {
    XXBT: 'BTC', XBTC: 'BTC', XETH: 'ETH', XXRP: 'XRP',
    XLTC: 'LTC', XXLM: 'XLM', XXMR: 'XMR', XZEC: 'ZEC',
    ZUSD: 'USD', ZEUR: 'EUR', ZGBP: 'GBP',
  }

  // Get USD prices via Kraken's public ticker
  const assetPairs: string[] = []
  for (const [asset, amtStr] of Object.entries(balances)) {
    const amt = parseFloat(amtStr)
    if (amt <= 0.000001) continue
    const clean = KRAKEN_NAME[asset] ?? asset.replace(/^[XZ]/, '')
    if (!STABLECOINS.has(clean) && clean !== 'USD' && clean !== 'EUR' && clean !== 'GBP') {
      assetPairs.push(`${asset}USD`)
    }
  }

  let priceMap = new Map<string, number>()
  if (assetPairs.length > 0) {
    try {
      const pr  = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${assetPairs.join(',')}`)
      const prd = await pr.json()
      for (const [pair, info] of Object.entries(prd.result ?? {})) {
        const lastPrice = parseFloat((info as any).c?.[0] ?? '0')
        priceMap.set(pair, lastPrice)
      }
    } catch { /* proceed without prices */ }
  }

  const positions: any[] = []
  let cashUSD = 0

  for (const [asset, amtStr] of Object.entries(balances)) {
    const amt   = parseFloat(amtStr)
    if (amt <= 0.000001) continue
    const clean = KRAKEN_NAME[asset] ?? asset.replace(/^[XZ]/, '')

    if (STABLECOINS.has(clean) || clean === 'USD') {
      cashUSD += amt
      continue
    }

    const price = priceMap.get(`${asset}USD`)
      ?? priceMap.get(`X${asset}ZUSD`)
      ?? priceMap.get(`${asset}ZUSD`)
      ?? 0

    positions.push({
      symbol:      clean,
      description: clean,
      units:       amt,
      quantity:    amt,
      price,
      currency:    'USD',
      type:        'crypto',
      open_pnl:    0,
    })
  }

  return { positions, cashUSD }
}

// ── KuCoin ────────────────────────────────────────────────────────────────────

async function kucoinHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

async function syncKucoin(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
): Promise<{ positions: any[]; cashUSD: number; error?: string }> {
  const ts      = Date.now().toString()
  const method  = 'GET'
  const path    = '/api/v1/accounts'
  const message = ts + method + path

  const sigB64   = await kucoinHmac(apiSecret, message)
  // KuCoin also signs the passphrase with the secret
  const ppB64    = await kucoinHmac(apiSecret, passphrase)

  const res = await fetch(`https://api.kucoin.com${path}`, {
    headers: {
      'KC-API-KEY':         apiKey,
      'KC-API-SIGN':        sigB64,
      'KC-API-TIMESTAMP':   ts,
      'KC-API-PASSPHRASE':  ppB64,
      'KC-API-KEY-VERSION': '2',
    },
  })

  if (!res.ok) return { positions: [], cashUSD: 0, error: `KuCoin HTTP ${res.status}` }

  const data = await res.json()
  if (data.code !== '200000') return { positions: [], cashUSD: 0, error: data.msg ?? 'KuCoin error' }

  // data.data is an array of account objects (type: 'main' | 'trade' | 'margin' etc.)
  const accounts: { currency: string; balance: string; type: string }[] = data.data ?? []

  // Aggregate by currency across all account types
  const totals = new Map<string, number>()
  for (const acct of accounts) {
    const cur = acct.currency
    const bal = parseFloat(acct.balance)
    if (bal > 0.000001) totals.set(cur, (totals.get(cur) ?? 0) + bal)
  }

  // Fetch all ticker prices from public KuCoin endpoint
  let priceMap = new Map<string, number>()
  try {
    const pr = await fetch('https://api.kucoin.com/api/v1/market/allTickers')
    const pd = await pr.json()
    for (const t of (pd.data?.ticker ?? [])) {
      priceMap.set(t.symbol, parseFloat(t.last ?? '0'))
    }
  } catch { /* proceed without prices */ }

  const positions: any[] = []
  let cashUSD = 0

  for (const [cur, qty] of totals) {
    if (STABLECOINS.has(cur) || cur === 'USD') {
      cashUSD += qty
      continue
    }
    const price = priceMap.get(`${cur}-USDT`)
      ?? priceMap.get(`${cur}-USD`)
      ?? 0
    positions.push({
      symbol:      cur,
      description: cur,
      units:       qty,
      quantity:    qty,
      price,
      currency:    'USD',
      type:        'crypto',
      open_pnl:    0,
    })
  }

  return { positions, cashUSD }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405)

  const user = await getUser(req.headers.get('authorization') ?? '')
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Fetch all active API key connections for this user
  const { data: connections, error: connErr } = await sb
    .from('exchange_connections')
    .select('exchange, label, api_key, api_secret, connection_type')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('connection_type', 'api_key')

  if (connErr) return json({ error: connErr.message }, 500)
  if (!connections?.length) return json({ synced: false, positions: 0, message: 'No exchange connections found' })

  const allPositions: any[] = []
  let totalCash = 0
  const errors: string[] = []
  const labels: string[] = []

  for (const conn of connections) {
    if (!conn.api_key || !conn.api_secret) continue

    let result: { positions: any[]; cashUSD: number; error?: string }

    if (conn.exchange === 'binance') {
      result = await syncBinance(conn.api_key, conn.api_secret, 'https://api.binance.com')
    } else if (conn.exchange === 'binance_us') {
      result = await syncBinance(conn.api_key, conn.api_secret, 'https://api.binance.us')
    } else if (conn.exchange === 'kraken') {
      result = await syncKraken(conn.api_key, conn.api_secret)
    } else if (conn.exchange === 'kucoin') {
      // KuCoin requires a passphrase — stored in api_secret as "secret|passphrase"
      const [secret, passphrase] = conn.api_secret.split('|')
      if (!passphrase) {
        result = { positions: [], cashUSD: 0, error: 'KuCoin secret must be in format: secret|passphrase' }
      } else {
        result = await syncKucoin(conn.api_key, secret, passphrase)
      }
    } else {
      errors.push(`${conn.label ?? conn.exchange}: unsupported exchange`)
      continue
    }

    const syncErr = result.error ?? null
    await sb.from('exchange_connections').update({
      sync_error:    syncErr,
      last_synced_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('exchange', conn.exchange)

    if (result.error) {
      errors.push(`${conn.label ?? conn.exchange}: ${result.error}`)
    } else {
      allPositions.push(...result.positions)
      totalCash += result.cashUSD
      labels.push(conn.label ?? conn.exchange)
    }
  }

  // Nothing was synced successfully
  if (allPositions.length === 0 && totalCash === 0 && errors.length > 0) {
    return json({ synced: false, positions: 0, errors, message: errors[0] }, 400)
  }

  const holdings = {
    account:   { name: labels.join(' + ') || 'Exchange Portfolio' },
    positions: allPositions,
    balances:  totalCash > 0 ? [{ currency: 'USD', cash: totalCash, buying_power: totalCash }] : [],
  }

  const { error: snapErr } = await sb.from('portfolio_snapshots').insert({
    user_id:     user.id,
    snapshot:    holdings,
    captured_at: new Date().toISOString(),
  })

  if (snapErr) return json({ error: snapErr.message }, 500)

  return json({
    synced:    true,
    positions: allPositions.length,
    cashUSD:   totalCash,
    errors,    // partial failures from other exchanges (if any)
  })
})
