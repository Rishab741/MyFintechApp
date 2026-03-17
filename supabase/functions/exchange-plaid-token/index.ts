import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PLAID_BASE_URL     = 'https://sandbox.plaid.com'
const SNAPTRADE_BASE_URL = 'https://api.snaptrade.com/api/v1'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const getSupabaseAdmin = () =>
  createClient(
    Deno.env.get('SNAPTRADE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SNAPTRADE_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

// ✅ Use Web Crypto API (native Deno) — produces Base64, which SnapTrade expects
async function hmacSign(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(secret)
  const messageData = encoder.encode(message)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
  // SnapTrade requires Base64, NOT hex
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, user_id, public_token, metadata } = body

    // ══════════════════════════════════════════════════════════════════════════
    // SNAPTRADE — Brokerages
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'snaptrade_create') {
      console.log("--- STARTING SNAPTRADE_CREATE ---");

      const clientId = Deno.env.get('SNAPTRADE_CLIENT_ID')
      const consumerKey = Deno.env.get('SNAPTRADE_CONSUMER_KEY')

      console.log("DEBUG clientId:", clientId)
  console.log("DEBUG consumerKey length:", consumerKey?.length)
  console.log("DEBUG consumerKey first5:", consumerKey?.substring(0, 5))
  console.log("DEBUG consumerKey last5:", consumerKey?.substring(consumerKey.length - 5))

      if (!clientId || !consumerKey) {
        return json({ error: "Server configuration missing" }, 500)
      }

      const supabaseAdmin = getSupabaseAdmin()

      // ✅ Fresh timestamp for EACH request to avoid clock-skew rejections
      const getTimestampAndSig = async () => {
        const timestamp = Math.floor(Date.now() / 1000).toString()
        const signature = await hmacSign(consumerKey, timestamp)
        return { timestamp, signature }
      }

      // 1. Check DB for existing user secret
      const { data: existingUser } = await supabaseAdmin
        .from('snaptrade_users')
        .select('user_secret')
        .eq('user_id', user_id)
        .maybeSingle()

      let userSecret = existingUser?.user_secret

      // 2. Register if not found
      if (!userSecret) {
        console.log("Registering new SnapTrade user...")
        const { timestamp, signature } = await getTimestampAndSig()

        const registerResponse = await fetch(
          `${SNAPTRADE_BASE_URL}/snapTrade/registerUser?clientId=${clientId}&timestamp=${timestamp}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'clientId': clientId,
              'timestamp': timestamp,
              'signature': signature,
            },
            body: JSON.stringify({ userId: user_id }),
          }
        )

        const registerData = await registerResponse.json()
        console.log("Register response:", JSON.stringify(registerData))

        if (registerResponse.ok && registerData.userSecret) {
          userSecret = registerData.userSecret
          await supabaseAdmin.from('snaptrade_users').upsert({
            user_id,
            user_secret: userSecret,
          })
        } else {
          return json({ error: "SnapTrade registration failed", details: registerData }, 401)
        }
      }

      // 3. Generate Login Portal Link — ✅ fresh timestamp here too
      console.log("Generating SnapTrade Login URI...")
      const { timestamp: loginTs, signature: loginSig } = await getTimestampAndSig()

      const loginResponse = await fetch(
        `${SNAPTRADE_BASE_URL}/snapTrade/login?clientId=${clientId}&timestamp=${loginTs}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'clientId': clientId,
            'timestamp': loginTs,
            'signature': loginSig,
          },
          body: JSON.stringify({ userId: user_id, userSecret }),
        }
      )

      const loginData = await loginResponse.json()
      console.log("Login response:", JSON.stringify(loginData))

      if (!loginResponse.ok) {
        return json({ error: "Failed to generate redirect URI", details: loginData }, 401)
      }

      return json({ redirect_uri: loginData.redirectURI })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PLAID — Traditional Banks
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'plaid_create') {
      const response = await fetch(`${PLAID_BASE_URL}/link/token/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID') ?? '',
          'PLAID-SECRET': Deno.env.get('PLAID_SECRET') ?? '',
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
      if (!response.ok) return json({ error: data.error_message }, 502)
      return json({ link_token: data.link_token })
    }

    if (action === 'plaid_exchange') {
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
      if (!plaidResponse.ok) return json({ error: plaidData.error_message }, 502)

      await getSupabaseAdmin().from('linked_accounts').insert({
        user_id,
        provider: 'plaid',
        access_token: plaidData.access_token,
        provider_item_id: plaidData.item_id,
        institution_name: metadata?.institution?.name ?? 'Bank',
        account_type: 'bank',
      })

      return json({ success: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (err) {
    console.error('CRITICAL ERROR:', err.message)
    return json({ error: 'Internal Server Error', message: err.message }, 500)
  }
})