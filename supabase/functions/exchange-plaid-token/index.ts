import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createHmac } from "https://deno.land/std@0.168.0/node/crypto.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PLAID_BASE_URL     = 'https://sandbox.plaid.com'
const SNAPTRADE_BASE_URL = 'https://api.snaptrade.com/api/v1'
const BINANCE_BASE_URL   = 'https://api.binance.com'
const COINBASE_BASE_URL  = 'https://api.coinbase.com/v2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const getSupabaseAdmin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

const hmacSign = (secret: string, message: string): string =>
  createHmac('sha256', secret).update(message).digest('hex')

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const {
      action,
      user_id,
      public_token,
      metadata,
      api_key,
      api_secret,
      authorization_id,
    } = body

    // ══════════════════════════════════════════════════════════════════════════
    // DEBUG — Check env vars (REMOVE AFTER FIXING)
    // ══════════════════════════════════════════════════════════════════════════
    if (action === 'debug') {
      const clientId = Deno.env.get('PLAID_CLIENT_ID')
      const secret   = Deno.env.get('PLAID_SECRET')
      return json({
        PLAID_CLIENT_ID_length: clientId?.length ?? 0,
        PLAID_CLIENT_ID_first6: clientId?.substring(0, 6) ?? 'EMPTY',
        PLAID_SECRET_length: secret?.length ?? 0,
        PLAID_SECRET_first6: secret?.substring(0, 6) ?? 'EMPTY',
      })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PLAID — Bank accounts
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'plaid_create') {
      const clientId = Deno.env.get('PLAID_CLIENT_ID') ?? ''
      const secret   = Deno.env.get('PLAID_SECRET') ?? ''

      const response = await fetch(`${PLAID_BASE_URL}/link/token/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PLAID-CLIENT-ID': clientId,
          'PLAID-SECRET': secret,
        },
        body: JSON.stringify({
          user: { client_user_id: user_id ?? 'user_sandbox' },
          client_name: 'Vestara',
          products: ['investments'],
          country_codes: ['US'],
          language: 'en',
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        console.error('Plaid create failed:', JSON.stringify(data))
        return json({ error: data.error_message ?? 'Failed to create Plaid link token' }, 502)
      }
      return json({ link_token: data.link_token })
    }

    if (action === 'plaid_exchange') {
      if (!public_token) return json({ error: 'public_token is required' }, 400)

      const plaidResponse = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID') ?? '',
          'PLAID-SECRET': Deno.env.get('PLAID_SECRET') ?? '',
        },
        body: JSON.stringify({ public_token }),
      })
      const plaidData = await plaidResponse.json()
      if (!plaidResponse.ok) {
        console.error('Plaid exchange failed:', plaidData)
        return json({ error: plaidData.error_message ?? 'Token exchange failed' }, 502)
      }

      const { error: dbError } = await getSupabaseAdmin()
        .from('linked_accounts')
        .insert({
          user_id: user_id ?? '00000000-0000-0000-0000-000000000000',
          provider: 'plaid',
          access_token: plaidData.access_token,
          provider_item_id: plaidData.item_id,
          institution_name: metadata?.institution?.name ?? 'Unknown',
          account_type: 'bank',
          created_at: new Date().toISOString(),
        })

      if (dbError) {
        console.error('DB insert failed:', dbError)
        return json({ error: 'Failed to save account' }, 500)
      }
      return json({ success: true })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SNAPTRADE — Stock brokerages
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'snaptrade_create') {
      if (!user_id) return json({ error: 'user_id is required' }, 400)

      const clientId    = Deno.env.get('SNAPTRADE_CLIENT_ID') ?? ''
      const consumerKey = Deno.env.get('SNAPTRADE_CONSUMER_KEY') ?? ''
      const timestamp   = Math.floor(Date.now() / 1000).toString()
      const signature   = hmacSign(consumerKey, `${clientId}${timestamp}`)

      const registerResponse = await fetch(`${SNAPTRADE_BASE_URL}/snapTrade/registerUser`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'clientId': clientId,
          'timestamp': timestamp,
          'signature': signature,
        },
        body: JSON.stringify({ userId: user_id }),
      })
      const registerData = await registerResponse.json()
      let userSecret = registerData.userSecret

      if (!userSecret) {
        const { data: existingUser } = await getSupabaseAdmin()
          .from('snaptrade_users')
          .select('user_secret')
          .eq('user_id', user_id)
          .single()
        userSecret = existingUser?.user_secret
      } else {
        await getSupabaseAdmin()
          .from('snaptrade_users')
          .upsert({ user_id, user_secret: userSecret })
      }

      if (!userSecret) return json({ error: 'Failed to get Snaptrade user secret' }, 500)

      const linkTimestamp = Math.floor(Date.now() / 1000).toString()
      const linkSignature = hmacSign(consumerKey, `${clientId}${linkTimestamp}`)

      const linkResponse = await fetch(`${SNAPTRADE_BASE_URL}/snapTrade/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'clientId': clientId,
          'timestamp': linkTimestamp,
          'signature': linkSignature,
        },
        body: JSON.stringify({ userId: user_id, userSecret }),
      })
      const linkData = await linkResponse.json()
      if (!linkResponse.ok) {
        console.error('Snaptrade login failed:', linkData)
        return json({ error: 'Failed to create Snaptrade link' }, 502)
      }
      return json({ redirect_uri: linkData.redirectURI })
    }

    if (action === 'snaptrade_exchange') {
      if (!authorization_id) return json({ error: 'authorization_id is required' }, 400)

      const { error: dbError } = await getSupabaseAdmin()
        .from('linked_accounts')
        .insert({
          user_id: user_id ?? '00000000-0000-0000-0000-000000000000',
          provider: 'snaptrade',
          provider_item_id: authorization_id,
          account_type: 'brokerage',
          institution_name: metadata?.broker ?? 'Unknown Broker',
          created_at: new Date().toISOString(),
        })

      if (dbError) {
        console.error('DB insert failed:', dbError)
        return json({ error: 'Failed to save Snaptrade account' }, 500)
      }
      return json({ success: true })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // COINBASE — Crypto (user-provided read-only API keys)
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'coinbase_connect') {
      if (!api_key || !api_secret) {
        return json({ error: 'api_key and api_secret are required' }, 400)
      }

      const timestamp = Math.floor(Date.now() / 1000).toString()
      const message   = `${timestamp}GET/v2/accounts`
      const signature = hmacSign(api_secret, message)

      const verifyResponse = await fetch(`${COINBASE_BASE_URL}/accounts`, {
        headers: {
          'CB-ACCESS-KEY': api_key,
          'CB-ACCESS-SIGN': signature,
          'CB-ACCESS-TIMESTAMP': timestamp,
          'CB-VERSION': '2016-02-18',
        },
      })
      const verifyData = await verifyResponse.json()
      if (!verifyResponse.ok) {
        console.error('Coinbase verify failed:', verifyData)
        return json({
          error: verifyData.errors?.[0]?.message ?? 'Invalid Coinbase API keys'
        }, 502)
      }

      const { error: dbError } = await getSupabaseAdmin()
        .from('linked_accounts')
        .insert({
          user_id: user_id ?? '00000000-0000-0000-0000-000000000000',
          provider: 'coinbase',
          access_token: api_key,
          refresh_token: api_secret,
          account_type: 'crypto',
          institution_name: 'Coinbase',
          created_at: new Date().toISOString(),
        })

      if (dbError) {
        console.error('DB insert failed:', dbError)
        return json({ error: 'Failed to save Coinbase account' }, 500)
      }
      return json({ success: true })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // BINANCE — Crypto (user-provided read-only API keys)
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'binance_connect') {
      if (!api_key || !api_secret) {
        return json({ error: 'api_key and api_secret are required' }, 400)
      }

      const timestamp   = Date.now().toString()
      const queryString = `timestamp=${timestamp}`
      const signature   = hmacSign(api_secret, queryString)

      const verifyResponse = await fetch(
        `${BINANCE_BASE_URL}/api/v3/account?${queryString}&signature=${signature}`,
        { headers: { 'X-MBX-APIKEY': api_key } }
      )
      const verifyData = await verifyResponse.json()
      if (!verifyResponse.ok) {
        console.error('Binance verify failed:', verifyData)
        return json({ error: verifyData.msg ?? 'Invalid Binance API keys' }, 502)
      }

      const { error: dbError } = await getSupabaseAdmin()
        .from('linked_accounts')
        .insert({
          user_id: user_id ?? '00000000-0000-0000-0000-000000000000',
          provider: 'binance',
          access_token: api_key,
          refresh_token: api_secret,
          account_type: 'crypto',
          institution_name: 'Binance',
          created_at: new Date().toISOString(),
        })

      if (dbError) {
        console.error('DB insert failed:', dbError)
        return json({ error: 'Failed to save Binance account' }, 500)
      }
      return json({ success: true })
    }

    return json({ error: `Unknown action: "${action}"` }, 400)

  } catch (err) {
    console.error('Unhandled function error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})