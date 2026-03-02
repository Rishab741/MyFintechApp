import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { action, public_token, metadata } = await req.json()

    // --- ACTION 1: CREATE LINK TOKEN ---
    if (action === 'create') {
      const response = await fetch(`https://sandbox.plaid.com/link/token/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Deno.env.get('PLAID_CLIENT_ID'),
          secret: Deno.env.get('PLAID_SECRET'),
          user: { client_user_id: 'user_123' }, // Replace with real User ID in production
          client_name: 'Vestara',
          products: ['investments'],
          country_codes: ['US'],
          language: 'en',
        }),
      })
      const data = await response.json()
      return new Response(JSON.stringify(data), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // --- ACTION 2: EXCHANGE PUBLIC TOKEN ---
    if (action === 'exchange' || public_token) {
      const plaidResponse = await fetch(`https://sandbox.plaid.com/item/public_token/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: Deno.env.get('PLAID_CLIENT_ID'),
          secret: Deno.env.get('PLAID_SECRET'),
          public_token: public_token,
        }),
      })

      const plaidData = await plaidResponse.json()
      if (!plaidResponse.ok) throw new Error('Plaid exchange failed')

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // Fallback ID for testing
      const userId = '00000000-0000-0000-0000-000000000000' 

      const { error: dbError } = await supabaseAdmin
        .from('linked_accounts')
        .insert({
          user_id: userId,
          access_token: plaidData.access_token,
          provider_item_id: plaidData.item_id,
          institution_name: metadata?.institution?.name || 'Unknown'
        })

      if (dbError) throw dbError
      return new Response(JSON.stringify({ success: true }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, headers: corsHeaders 
    })
  }
})