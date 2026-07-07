import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  // Restrict to known origins; '*' allows any website to trigger credentialed requests.
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'https://platstock.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Read from env so switching sandbox → production is a config change, not a code change.
const PLAID_BASE_URL = Deno.env.get('PLAID_BASE_URL') ?? 'https://sandbox.plaid.com'
const SNAPTRADE_BASE_URL = 'https://api.snaptrade.com/api/v1'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ── JWT verification — user_id comes only from the verified token ─────────────
async function getUser(authHeader: string) {
  if (!authHeader.startsWith('Bearer ')) return null
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7))
  return error ? null : user
}

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
  const redirectUri = encodeURIComponent('platstock://snaptrade-callback')
  const query = `clientId=${clientId}&timestamp=${timestamp}&userId=${userId}&userSecret=${userSecret}&customRedirect=${redirectUri}&immediateRedirect=true`
  const path = '/api/v1/snapTrade/login'
  const signature = await snapTradeSign(consumerKey, path, query, null)

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

  // ── Auth gate: every action requires a valid Supabase session ─────────────
  const user = await getUser(req.headers.get('authorization') ?? '')
  if (!user) return json({ error: 'Unauthorized' }, 401)
  // user.id is the authoritative user identifier for the remainder of this function
  const userId = user.id

  try {
    const body = await req.json()
    const { action, public_token, metadata } = body

    // ══════════════════════════════════════════════════════════════════════════
    // SNAPTRADE — Brokerages
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'snaptrade_create') {
      console.log("--- STARTING SNAPTRADE_CREATE ---")
      console.log("App userId:", userId)

      const clientId = Deno.env.get('SNAPTRADE_CLIENT_ID')
      const consumerKey = Deno.env.get('SNAPTRADE_CONSUMER_KEY')
      if (!clientId || !consumerKey) return json({ error: "Config missing" }, 500)

      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

      // If the user already connected a brokerage, skip the portal.
      const { data: existingConnection } = await supabaseAdmin
        .from('snaptrade_connections')
        .select('account_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (existingConnection?.account_id) {
        console.log("User already connected, skipping portal ✅")
        return json({ already_connected: true })
      }

      // 1. Check DB for existing user secret
      const { data: existingUser } = await supabaseAdmin
        .from('snaptrade_users')
        .select('user_secret')
        .eq('user_id', userId)
        .maybeSingle()

      let userSecret = existingUser?.user_secret

      // 2. Register if not found in DB
      if (!userSecret) {
        console.log("No secret in DB. Attempting registration...")

        const { status: regStatus, data: regData } = await snapTradeRequest(
          clientId, consumerKey, 'POST', '/snapTrade/registerUser', { userId }
        )
        console.log("Register response:", JSON.stringify(regData))

        if (regStatus === 200 && regData.userSecret) {
          userSecret = regData.userSecret
          console.log("Waiting for registration to fully activate...")
          await waitForRegistration(clientId, consumerKey, userId)

        } else if (regData.code === '1012' || regData.code === 1012) {
          // 1012 = "Personal keys can only register one user."
          // The personal key slot is occupied by a DIFFERENT user — list them, evict, then register.
          console.log("1012 hit — personal key slot occupied; listing current registrants...")
          const { data: userList } = await snapTradeRequest(
            clientId, consumerKey, 'GET', '/snapTrade/listUsers', null
          )
          console.log("Currently registered in SnapTrade:", JSON.stringify(userList))
          const occupants: string[] = Array.isArray(userList) ? userList : []

          for (const occupantId of occupants) {
            // userId must be in query params — NOT in the request body
            const { status: delSt, data: delD } = await snapTradeRequest(
              clientId, consumerKey, 'DELETE', '/snapTrade/deleteUser', null,
              `userId=${encodeURIComponent(occupantId)}`
            )
            console.log(`Evicted SnapTrade occupant ${occupantId}:`, delSt, JSON.stringify(delD))
            // Soft-clear DB records so the evicted user can reconnect cleanly
            await supabaseAdmin.from('snaptrade_users').delete().eq('user_id', occupantId)
            await supabaseAdmin.from('snaptrade_connections').delete().eq('user_id', occupantId)
            await supabaseAdmin.from('brokerage_accounts')
              .update({ is_active: false, reconnect_required: true, sync_error: 'Account reset — please reconnect' })
              .eq('user_id', occupantId)
          }

          await waitForDeletion(clientId, consumerKey, occupants[0] ?? userId)

          console.log("Re-registering current user...")
          const { status: retryStatus, data: retryData } = await snapTradeRequest(
            clientId, consumerKey, 'POST', '/snapTrade/registerUser', { userId }
          )
          console.log("Re-register response:", JSON.stringify(retryData))

          if (retryStatus === 200 && retryData.userSecret) {
            userSecret = retryData.userSecret
            console.log("Waiting for registration to fully activate...")
            await waitForRegistration(clientId, consumerKey, userId)
          } else {
            return json({ error: "Re-registration failed after 1012", details: retryData }, 401)
          }

        } else if (regData.code === '1010' || regData.code === 1010) {
          console.log("1010 hit — userId exists, cycling to get fresh secret...")
          // userId must be in query params — NOT in the request body
          const { status: delStatus, data: delData } = await snapTradeRequest(
            clientId, consumerKey, 'DELETE', '/snapTrade/deleteUser', null,
            `userId=${encodeURIComponent(userId)}`
          )
          console.log("Delete response:", delStatus, JSON.stringify(delData))
          await waitForDeletion(clientId, consumerKey, userId)

          console.log("Re-registering...")
          const { status: retryStatus, data: retryData } = await snapTradeRequest(
            clientId, consumerKey, 'POST', '/snapTrade/registerUser', { userId }
          )
          console.log("Re-register response:", JSON.stringify(retryData))

          if (retryStatus === 200 && retryData.userSecret) {
            userSecret = retryData.userSecret
            console.log("Waiting for registration to fully activate...")
            await waitForRegistration(clientId, consumerKey, userId)
          } else {
            return json({ error: "Re-registration failed after 1010", details: retryData }, 401)
          }

        } else {
          return json({ error: "Registration failed", details: regData }, 401)
        }

        await supabaseAdmin.from('snaptrade_users').upsert({
          user_id: userId,
          user_secret: userSecret,
        })
        console.log("userSecret saved to DB ✅")
      }

      // 3. Generate Login Portal Link
      console.log("Generating Login Link...")
      const { status: loginStatus, data: loginData } = await snapTradeLogin(
        clientId, consumerKey, userId, userSecret
      )
      console.log("Login response:", JSON.stringify(loginData))

      if (loginData.code === '1083' || loginData.code === 1083) {
        console.log("1083 on login — waiting 4s and retrying once...")
        await delay(4000)

        const { status: retryLoginStatus, data: retryLoginData } = await snapTradeLogin(
          clientId, consumerKey, userId, userSecret
        )
        console.log("Retry login response:", JSON.stringify(retryLoginData))

        if (retryLoginStatus === 200 && retryLoginData.redirectURI) {
          return json({ redirect_uri: retryLoginData.redirectURI })
        }

        // Retry also failed — secret is stale. Auto-recover with fresh registration.
        console.log("Retry login failed — auto-recovering with fresh registration...")
        await supabaseAdmin.from('snaptrade_users').delete().eq('user_id', userId)
        await snapTradeRequest(clientId, consumerKey, 'DELETE', '/snapTrade/deleteUser', null, `userId=${encodeURIComponent(userId)}`)
        await waitForDeletion(clientId, consumerKey, userId)

        const { status: freshRegStatus, data: freshRegData } = await snapTradeRequest(
          clientId, consumerKey, 'POST', '/snapTrade/registerUser', { userId }
        )
        console.log("Fresh re-register response:", JSON.stringify(freshRegData))

        if (freshRegStatus === 200 && freshRegData.userSecret) {
          const freshSecret = freshRegData.userSecret
          await supabaseAdmin.from('snaptrade_users').upsert({ user_id: userId, user_secret: freshSecret })
          await waitForRegistration(clientId, consumerKey, userId)

          const { status: freshLoginStatus, data: freshLoginData } = await snapTradeLogin(
            clientId, consumerKey, userId, freshSecret
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
    // SNAPTRADE — Save connection after user completes the portal.
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'snaptrade_save_connection') {
      const { brokerage_authorization_id } = body

      const clientId = Deno.env.get('SNAPTRADE_CLIENT_ID')
      const consumerKey = Deno.env.get('SNAPTRADE_CONSUMER_KEY')
      if (!clientId || !consumerKey) return json({ error: "Config missing" }, 500)

      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

      const { data: userData } = await supabaseAdmin
        .from('snaptrade_users')
        .select('user_secret')
        .eq('user_id', userId)
        .single()

      if (!userData?.user_secret) {
        return json({ error: "User not registered" }, 404)
      }

      // Fetch ALL accounts from SnapTrade (user may have connected multiple)
      const { data: accounts } = await snapTradeRequest(
        clientId, consumerKey, 'GET', '/accounts', null,
        `userId=${userId}&userSecret=${userData.user_secret}`
      )
      console.log("Accounts after connection:", JSON.stringify(accounts))

      const accountList = Array.isArray(accounts) ? accounts : []
      const accountId   = accountList.length > 0 ? accountList[0].id : brokerage_authorization_id

      await supabaseAdmin.from('snaptrade_connections').upsert({
        user_id: userId,
        account_id: accountId,
        brokerage_authorization_id: brokerage_authorization_id ?? null,
        connected_at: new Date().toISOString(),
      })

      if (accountList.length > 0) {
        const rows = accountList.map((acc: any) => ({
          user_id: userId,
          provider:               'snaptrade',
          snaptrade_account_id:   acc.id,
          snaptrade_auth_id:      brokerage_authorization_id ?? null,
          brokerage_slug:         acc.brokerage?.slug ?? null,
          brokerage_name:         acc.brokerage?.name ?? null,
          brokerage_logo_url:     acc.brokerage?.square_logo_url ?? null,
          account_name:           acc.name ?? null,
          account_number:         acc.number ?? null,
          account_type:           acc.type ?? null,
          currency:               acc.currency?.code ?? 'USD',
          is_active:              true,
          reconnect_required:     false,
          last_synced_at:         new Date().toISOString(),
        }))
        await supabaseAdmin
          .from('brokerage_accounts')
          .upsert(rows, { onConflict: 'user_id,provider,snaptrade_account_id' })
        console.log(`Saved ${rows.length} account(s) to brokerage_accounts ✅`)
      }

      console.log("Connection saved to DB ✅")
      return json({ success: true, account_id: accountId, accounts_connected: accountList.length })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SNAPTRADE — Fetch live holdings and save a portfolio snapshot.
    // ══════════════════════════════════════════════════════════════════════════

    if (action === 'snaptrade_get_holdings') {
      const clientId = Deno.env.get('SNAPTRADE_CLIENT_ID')
      const consumerKey = Deno.env.get('SNAPTRADE_CONSUMER_KEY')
      if (!clientId || !consumerKey) return json({ error: "Config missing" }, 500)

      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

      const { data: userData } = await supabaseAdmin
        .from('snaptrade_users')
        .select('user_secret')
        .eq('user_id', userId)
        .single()

      if (!userData?.user_secret) {
        return json({ error: "User not registered with SnapTrade" }, 404)
      }

      const { data: connection } = await supabaseAdmin
        .from('snaptrade_connections')
        .select('account_id')
        .eq('user_id', userId)
        .single()

      if (!connection?.account_id) {
        return json({ error: "No brokerage connected" }, 404)
      }

      const { status: holdingsStatus, data: holdings } = await snapTradeRequest(
        clientId, consumerKey, 'GET',
        `/accounts/${connection.account_id}/holdings`, null,
        `userId=${userId}&userSecret=${userData.user_secret}`
      )

      console.log("Holdings status:", holdingsStatus, JSON.stringify(holdings))

      if (holdingsStatus === 401 || holdingsStatus === 403) {
        await supabaseAdmin
          .from('snaptrade_connections')
          .delete()
          .eq('user_id', userId)
        console.log("Stale brokerage auth cleared from DB — user must reconnect")
        return json({
          error: "brokerage_auth_expired",
          message: "Your brokerage authorization has expired. Please reconnect your account.",
        }, 401)
      }

      if (holdingsStatus !== 200) {
        return json({ error: "Failed to fetch holdings", details: holdings }, holdingsStatus)
      }

      await supabaseAdmin.from('portfolio_snapshots').insert({
        user_id: userId,
        snapshot: holdings,
        captured_at: new Date().toISOString(),
      })

      return json({ holdings, captured_at: new Date().toISOString() })
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
          user: { client_user_id: userId },
          client_name: 'Platstock',
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

      await createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        .from('linked_accounts').insert({
          user_id: userId,
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
    // Never leak internal error details to the client
    console.error('CRITICAL ERROR:', err instanceof Error ? err.message : String(err))
    return json({ error: 'Internal Server Error' }, 500)
  }
})
