import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PLAID_BASE_URL = 'https://sandbox.plaid.com'
const SNAPTRADE_BASE_URL = 'https://api.snaptrade.com/api/v1'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

async function snapTradeSign(
  consumerKey: string,
  path: string,
  query: string,
  content: Record<string, unknown> | null
): Promise<string> {
  const sigObject = { content, path, query }
  const sigContent = JSON.stringify(sigObject)
  const encoder = new TextEncoder()
  const encodedKey = encodeURI(consumerKey)
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(encodedKey),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(sigContent))
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

async function snapTradeRequest(
  clientId: string,
  consumerKey: string,
  method: string,
  path: string,
  body: Record<string, unknown> | null = null
): Promise<{ status: number; data: any }> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const query = `clientId=${clientId}&timestamp=${timestamp}`
  const signature = await snapTradeSign(consumerKey, `/api/v1${path}`, query, body)

  const res = await fetch(`${SNAPTRADE_BASE_URL}${path}?${query}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'clientId': clientId,
      'timestamp': timestamp,
      'Signature': signature,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const data = await res.json()
  return { status: res.status, data }
}

// ✅ Login is special — userId and userSecret go in QUERY PARAMS not body
async function snapTradeLogin(
  clientId: string,
  consumerKey: string,
  userId: string,
  userSecret: string
): Promise<{ status: number; data: any }> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const query = `clientId=${clientId}&timestamp=${timestamp}&userId=${userId}&userSecret=${userSecret}`
  const path = '/api/v1/snapTrade/login'
  const signature = await snapTradeSign(consumerKey, path, query, null)

  console.log("Signing:", JSON.stringify({ content: null, path, query }))

  const res = await fetch(`${SNAPTRADE_BASE_URL}/snapTrade/login?${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'clientId': clientId,
      'timestamp': timestamp,
      'Signature': signature,
    },
  })

  const data = await res.json()
  return { status: res.status, data }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function waitForDeletion(
  clientId: string,
  consumerKey: string,
  userId: string,
  maxAttempts = 10
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await delay(2000)
    const { data: userList } = await snapTradeRequest(
      clientId, consumerKey, 'GET', '/snapTrade/listUsers', null
    )
    console.log(`Polling deletion attempt ${i + 1}:`, JSON.stringify(userList))
    if (Array.isArray(userList) && !userList.includes(userId)) {
      console.log("User fully deleted ✅")
      return
    }
  }
  console.log("Max deletion polling attempts reached, proceeding anyway...")
}

async function waitForRegistration(
  clientId: string,
  consumerKey: string,
  userId: string,
  maxAttempts = 10
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await delay(2000)
    const { data: userList } = await snapTradeRequest(
      clientId, consumerKey, 'GET', '/snapTrade/listUsers', null
    )
    console.log(`Polling registration attempt ${i + 1}:`, JSON.stringify(userList))
    if (Array.isArray(userList) && userList.includes(userId)) {
      console.log("User fully registered and active ✅")
      return
    }
  }
  console.log("Max registration polling attempts reached, proceeding anyway...")
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await req.json()
    const { action, user_id, public_token, metadata } = body

    // ══════════════════════════════════════════════════════════════════════════
    // SNAPTRADE — Brokerages
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'snaptrade_create') {
      console.log("--- STARTING SNAPTRADE_CREATE ---")
      console.log("App user_id:", user_id)

      const clientId = Deno.env.get('SNAPTRADE_CLIENT_ID')
      const consumerKey = Deno.env.get('SNAPTRADE_CONSUMER_KEY')
      if (!clientId || !consumerKey) return json({ error: "Config missing" }, 500)

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      // 1. Check DB for existing user secret
      const { data: existingUser } = await supabaseAdmin
        .from('snaptrade_users')
        .select('user_secret')
        .eq('user_id', user_id)
        .maybeSingle()

      let userSecret = existingUser?.user_secret

      // 2. Register if not found in DB
      if (!userSecret) {
        console.log("No secret in DB. Attempting registration...")

        const { status: regStatus, data: regData } = await snapTradeRequest(
          clientId, consumerKey, 'POST', '/snapTrade/registerUser', { userId: user_id }
        )
        console.log("Register response:", JSON.stringify(regData))

        if (regStatus === 200 && regData.userSecret) {
          userSecret = regData.userSecret
          console.log("Waiting for registration to fully activate...")
          await waitForRegistration(clientId, consumerKey, user_id)

        } else if (regData.code === '1012' || regData.code === 1012) {
          console.log("1012 hit — listing all SnapTrade users to clean up...")
          const { data: userList } = await snapTradeRequest(
            clientId, consumerKey, 'GET', '/snapTrade/listUsers', null
          )
          console.log("Existing SnapTrade users:", JSON.stringify(userList))

          if (Array.isArray(userList)) {
            for (const existingUserId of userList) {
              console.log(`Deleting SnapTrade user: ${existingUserId}`)
              const { status: delStatus, data: delData } = await snapTradeRequest(
                clientId, consumerKey, 'DELETE', '/snapTrade/deleteUser', { userId: existingUserId }
              )
              console.log(`Delete ${existingUserId}:`, delStatus, JSON.stringify(delData))
              await waitForDeletion(clientId, consumerKey, existingUserId)
            }
          }

          console.log("Re-registering with correct userId...")
          const { status: retryStatus, data: retryData } = await snapTradeRequest(
            clientId, consumerKey, 'POST', '/snapTrade/registerUser', { userId: user_id }
          )
          console.log("Re-register response:", JSON.stringify(retryData))

          if (retryStatus === 200 && retryData.userSecret) {
            userSecret = retryData.userSecret
            console.log("Waiting for registration to fully activate...")
            await waitForRegistration(clientId, consumerKey, user_id)
          } else {
            return json({ error: "Re-registration failed after 1012", details: retryData }, 401)
          }

        } else if (regData.code === '1010' || regData.code === 1010) {
          console.log("1010 hit — userId exists, cycling to get fresh secret...")
          const { status: delStatus, data: delData } = await snapTradeRequest(
            clientId, consumerKey, 'DELETE', '/snapTrade/deleteUser', { userId: user_id }
          )
          console.log("Delete response:", delStatus, JSON.stringify(delData))
          await waitForDeletion(clientId, consumerKey, user_id)

          console.log("Re-registering...")
          const { status: retryStatus, data: retryData } = await snapTradeRequest(
            clientId, consumerKey, 'POST', '/snapTrade/registerUser', { userId: user_id }
          )
          console.log("Re-register response:", JSON.stringify(retryData))

          if (retryStatus === 200 && retryData.userSecret) {
            userSecret = retryData.userSecret
            console.log("Waiting for registration to fully activate...")
            await waitForRegistration(clientId, consumerKey, user_id)
          } else {
            return json({ error: "Re-registration failed after 1010", details: retryData }, 401)
          }

        } else {
          return json({ error: "Registration failed", details: regData }, 401)
        }

        await supabaseAdmin.from('snaptrade_users').upsert({
          user_id,
          user_secret: userSecret,
        })
        console.log("userSecret saved to DB ✅")
      }

      // 3. Generate Login Portal Link
      console.log("Generating Login Link...")
      const { status: loginStatus, data: loginData } = await snapTradeLogin(
        clientId, consumerKey, user_id, userSecret
      )
      console.log("Login response:", JSON.stringify(loginData))

      if (loginData.code === '1083' || loginData.code === 1083) {
        console.log("1083 on login — waiting 4s and retrying once...")
        await delay(4000)

        const { status: retryLoginStatus, data: retryLoginData } = await snapTradeLogin(
          clientId, consumerKey, user_id, userSecret
        )
        console.log("Retry login response:", JSON.stringify(retryLoginData))

        if (retryLoginStatus === 200 && retryLoginData.redirectURI) {
          return json({ redirect_uri: retryLoginData.redirectURI })
        }

        console.log("Retry login also failed, clearing DB for next attempt...")
        await supabaseAdmin.from('snaptrade_users').delete().eq('user_id', user_id)
        return json({ error: "Session expired, please try connecting again" }, 401)
      }

      if (loginStatus !== 200) {
        return json({ error: "Login failed", details: loginData }, 401)
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

      await createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      ).from('linked_accounts').insert({
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