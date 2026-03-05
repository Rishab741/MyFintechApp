import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PLAID_BASE_URL = 'https://sandbox.plaid.com'

const plaidHeaders = {
  'Content-Type': 'application/json',
  'PLAID-CLIENT-ID': Deno.env.get('PLAID_CLIENT_ID') ?? '',
  'PLAID-SECRET': Deno.env.get('PLAID_SECRET') ?? '',
}

// Helper: return a typed JSON response
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, public_token, metadata, user_id } = await req.json()

    // ----------------------------------------------------------------
    // ACTION: create — get a Plaid Link token to initialize the SDK
    // ----------------------------------------------------------------
    if (action === 'create') {
      const response = await fetch(`${PLAID_BASE_URL}/link/token/create`, {
        method: 'POST',
        headers: plaidHeaders,
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
        console.error('Plaid link/token/create failed:', data)
        return json({ error: data.error_message ?? 'Failed to create link token' }, 502)
      }

      return json({ link_token: data.link_token })
    }

    // ----------------------------------------------------------------
    // ACTION: exchange — swap public token for a persistent access token
    // ----------------------------------------------------------------
    if (action === 'exchange') {
      if (!public_token) {
        return json({ error: 'public_token is required' }, 400)
      }

      // 1. Exchange with Plaid
      const plaidResponse = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
        method: 'POST',
        headers: plaidHeaders,
        body: JSON.stringify({ public_token }),
      })

      const plaidData = await plaidResponse.json()

      if (!plaidResponse.ok) {
        console.error('Plaid token exchange failed:', plaidData)
        return json({ error: plaidData.error_message ?? 'Token exchange failed' }, 502)
      }

      // 2. Store access token in Supabase (service role bypasses RLS)
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const { error: dbError } = await supabaseAdmin
        .from('linked_accounts')
        .insert({
          user_id: user_id ?? '00000000-0000-0000-0000-000000000000',
          access_token: plaidData.access_token,
          provider_item_id: plaidData.item_id,
          institution_name: metadata?.institution?.name ?? 'Unknown',
          created_at: new Date().toISOString(),
        })

      if (dbError) {
        console.error('DB insert failed:', dbError)
        return json({ error: 'Failed to save account' }, 500)
      }

      return json({ success: true })
    }

    // ----------------------------------------------------------------
    // Unknown action
    // ----------------------------------------------------------------
    return json({ error: `Unknown action: "${action}"` }, 400)

  } catch (err) {
    console.error('Unhandled function error:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})