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

// ── UNTOUCHED from original working code ──────────────────────────────────────
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

// ── UNTOUCHED from original working code ──────────────────────────────────────
async function snapTradeRequest(
  clientId: string,
  consumerKey: string,
  method: string,
  path: string,
  body: Record<string, unknown> | null = null,
  extraQuery = ''
): Promise<{ status: number; data: any }> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const baseQuery = `clientId=${clientId}&timestamp=${timestamp}`
  const query = extraQuery ? `${baseQuery}&${extraQuery}` : baseQuery
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

async function snapTradeLogin(
  clientId: string,
  consumerKey: string,
  userId: string,
  userSecret: string
): Promise<{ status: number; data: any }> {
  const timestamp = Math.floor(Date.now() / 1000).toString()

  // customRedirect and immediateRedirect go in the query string alongside the
  // auth params — same string that gets signed with null content.
  // This is safe because the original signing worked with null content,
  // and adding params to the query doesn't change the content field.
  const redirectUri = encodeURIComponent('myfintechapp://snaptrade-callback')
  const query = `clientId=${clientId}&timestamp=${timestamp}&userId=${userId}&userSecret=${userSecret}&customRedirect=${redirectUri}&immediateRedirect=true`
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

// ── UNTOUCHED from original working code ──────────────────────────────────────
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

      // ── NEW: If the user already connected a brokerage, skip the portal.
      // This is the only addition to snaptrade_create — everything else below
      // is byte-for-byte identical to the original working code.
      const { data: existingConnection } = await supabaseAdmin
        .from('snaptrade_connections')
        .select('account_id')
        .eq('user_id', user_id)
        .maybeSingle()

      if (existingConnection?.account_id) {
        console.log("User already connected, skipping portal ✅")
        return json({ already_connected: true })
      }

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
          // 1012 = this userId already exists in SnapTrade but we have no secret.
          // Only delete THIS user — never wipe other users' accounts.
          console.log("1012 hit — deleting and re-registering current user only...")
          const { status: delStatus, data: delData } = await snapTradeRequest(
            clientId, consumerKey, 'DELETE', '/snapTrade/deleteUser', { userId: user_id }
          )
          console.log(`Delete ${user_id}:`, delStatus, JSON.stringify(delData))
          await waitForDeletion(clientId, consumerKey, user_id)

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

        // Retry also failed — secret is stale. Auto-recover: delete, re-register,
        // and return a fresh link in this same request so the user never sees an error.
        console.log("Retry login failed — auto-recovering with fresh registration...")
        await supabaseAdmin.from('snaptrade_users').delete().eq('user_id', user_id)
        await snapTradeRequest(clientId, consumerKey, 'DELETE', '/snapTrade/deleteUser', { userId: user_id })
        await waitForDeletion(clientId, consumerKey, user_id)

        const { status: freshRegStatus, data: freshRegData } = await snapTradeRequest(
          clientId, consumerKey, 'POST', '/snapTrade/registerUser', { userId: user_id }
        )
        console.log("Fresh re-register response:", JSON.stringify(freshRegData))

        if (freshRegStatus === 200 && freshRegData.userSecret) {
          const freshSecret = freshRegData.userSecret
          await supabaseAdmin.from('snaptrade_users').upsert({ user_id, user_secret: freshSecret })
          await waitForRegistration(clientId, consumerKey, user_id)

          const { status: freshLoginStatus, data: freshLoginData } = await snapTradeLogin(
            clientId, consumerKey, user_id, freshSecret
          )
          console.log("Fresh login response:", JSON.stringify(freshLoginData))
          if (freshLoginStatus === 200 && freshLoginData.redirectURI) {
            return json({ redirect_uri: freshLoginData.redirectURI })
          }
        }
        return json({ error: "Session expired, please try connecting again" }, 401)
      }

      if (loginStatus !== 200) {
        return json({ error: "Login failed", details: loginData }, 401)
      }

      return json({ redirect_uri: loginData.redirectURI })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SNAPTRADE — NEW: Save connection after user completes the portal.
    // Call this from your deep link handler in ConnectInvestments.tsx once
    // SnapTrade redirects back to vestara://snaptrade-callback.
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'snaptrade_save_connection') {
      const { brokerage_authorization_id } = body

      const clientId = Deno.env.get('SNAPTRADE_CLIENT_ID')
      const consumerKey = Deno.env.get('SNAPTRADE_CONSUMER_KEY')
      if (!clientId || !consumerKey) return json({ error: "Config missing" }, 500)

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      const { data: userData } = await supabaseAdmin
        .from('snaptrade_users')
        .select('user_secret')
        .eq('user_id', user_id)
        .single()

      if (!userData?.user_secret) {
        return json({ error: "User not registered" }, 404)
      }

      // Fetch the account list from SnapTrade to get the real account_id
      const { data: accounts } = await snapTradeRequest(
        clientId, consumerKey, 'GET', '/accounts', null,
        `userId=${user_id}&userSecret=${userData.user_secret}`
      )
      console.log("Accounts after connection:", JSON.stringify(accounts))

      const accountId = Array.isArray(accounts) && accounts.length > 0
        ? accounts[0].id
        : brokerage_authorization_id

      await supabaseAdmin.from('snaptrade_connections').upsert({
        user_id,
        account_id: accountId,
        brokerage_authorization_id: brokerage_authorization_id ?? null,
        connected_at: new Date().toISOString(),
      })

      console.log("Connection saved to DB ✅")
      return json({ success: true, account_id: accountId })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SNAPTRADE — NEW: Fetch live holdings and save a portfolio snapshot.
    // Call this from your portfolio/analytics screen.
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'snaptrade_get_holdings') {
      const clientId = Deno.env.get('SNAPTRADE_CLIENT_ID')
      const consumerKey = Deno.env.get('SNAPTRADE_CONSUMER_KEY')
      if (!clientId || !consumerKey) return json({ error: "Config missing" }, 500)

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      const { data: userData } = await supabaseAdmin
        .from('snaptrade_users')
        .select('user_secret')
        .eq('user_id', user_id)
        .single()

      if (!userData?.user_secret) {
        return json({ error: "User not registered with SnapTrade" }, 404)
      }

      const { data: connection } = await supabaseAdmin
        .from('snaptrade_connections')
        .select('account_id')
        .eq('user_id', user_id)
        .single()

      if (!connection?.account_id) {
        return json({ error: "No brokerage connected" }, 404)
      }

      const { status: holdingsStatus, data: holdings } = await snapTradeRequest(
        clientId, consumerKey, 'GET',
        `/accounts/${connection.account_id}/holdings`, null,
        `userId=${user_id}&userSecret=${userData.user_secret}`
      )

      console.log("Holdings status:", holdingsStatus, JSON.stringify(holdings))

      if (holdingsStatus === 401 || holdingsStatus === 403) {
        // Brokerage authorization has expired — clear the stale connection so
        // the app can prompt the user to reconnect.
        await supabaseAdmin
          .from('snaptrade_connections')
          .delete()
          .eq('user_id', user_id)
        console.log("Stale brokerage auth cleared from DB — user must reconnect")
        return json({
          error: "brokerage_auth_expired",
          message: "Your brokerage authorization has expired. Please reconnect your account.",
        }, 401)
      }

      if (holdingsStatus !== 200) {
        return json({ error: "Failed to fetch holdings", details: holdings }, holdingsStatus)
      }

      // Persist snapshot for time-series charting and analytics/predictions
      await supabaseAdmin.from('portfolio_snapshots').insert({
        user_id,
        snapshot: holdings,
        captured_at: new Date().toISOString(),
      })

      return json({ holdings, captured_at: new Date().toISOString() })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PLAID — Traditional Banks (UNTOUCHED from original)
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