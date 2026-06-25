import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Proxies the snaptrade_get_holdings call to the Supabase edge function
// server-side — avoids the CORS restriction on the browser path.
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.functions.invoke("exchange-plaid-token", {
    body: { action: "snaptrade_get_holdings" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
  return NextResponse.json(data ?? { ok: true });
}
