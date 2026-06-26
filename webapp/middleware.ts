import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ── Onboarding step → route map ───────────────────────────────────────────────
// The middleware reads the `platstock_ob` cookie (set by /api/onboarding) to
// decide where to route the user — no DB call, zero added latency.
const STEP_ROUTES: Record<string, string> = {
  PENDING_VERIFICATION:  "/onboarding/verify-email",
  MFA_SETUP:             "/onboarding/mfa",
  WORKSPACE_CONFIGURED:  "/onboarding/workspace",
  INTEGRATION_CONNECTED: "/onboarding/connect",
};

const OB_COOKIE = "platstock_ob";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cs) =>
          cs.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }),
      },
    },
  );

  const { pathname } = request.nextUrl;

  // getSession() reads the JWT from the cookie — no network call on valid token.
  const { data: { session }, error } = await supabase.auth.getSession();

  // Stale refresh token — delete all sb-* cookies and send to login.
  if (error && (error.status === 400 || (error as any).code === "refresh_token_not_found")) {
    const redirect = NextResponse.redirect(new URL("/", request.url));
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith("sb-")) redirect.cookies.delete(cookie.name);
    }
    return redirect;
  }

  const isOnboarding = pathname.startsWith("/onboarding");
  const isDashboard  = pathname.startsWith("/dashboard");
  const isRoot       = pathname === "/";

  // ── Unauthenticated ───────────────────────────────────────────────────────
  if (!session) {
    if (isDashboard || isOnboarding) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  // ── Authenticated ─────────────────────────────────────────────────────────
  // Read onboarding step from cookie (no network call).
  const obStep = request.cookies.get(OB_COOKIE)?.value;
  const isIncomplete = obStep && obStep !== "COMPLETED";
  const stepRoute = obStep ? STEP_ROUTES[obStep] : null;

  // 1. Root → redirect based on onboarding state
  if (isRoot) {
    if (isIncomplete && stepRoute) {
      return NextResponse.redirect(new URL(stepRoute, request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 2. Dashboard access while onboarding is incomplete → push to current step
  if (isDashboard && isIncomplete && stepRoute) {
    return NextResponse.redirect(new URL(stepRoute, request.url));
  }

  // 3. Onboarding pages while already completed → go to dashboard
  if (isOnboarding && (!obStep || obStep === "COMPLETED")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
