import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_ENV } from "@/lib/env";

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

// ── Advisor public routes (no auth required) ──────────────────────────────────
// Everything else under /advisor/* is protected and requires a valid advisor
// session with app_metadata.role === "advisor" AND a confirmed email.
const ADVISOR_PUBLIC = new Set([
  "/advisor/login",
  "/advisor/signup",
  "/advisor/verify",
]);

function isAdvisorPublic(pathname: string) {
  return ADVISOR_PUBLIC.has(pathname) ||
    pathname.startsWith("/advisor/login/") ||
    pathname.startsWith("/advisor/signup/") ||
    pathname.startsWith("/advisor/verify/");
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    PUBLIC_ENV.SUPABASE_URL,
    PUBLIC_ENV.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cs: Parameters<SetAllCookies>[0]) =>
          cs.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }),
      },
    },
  );

  const { pathname } = request.nextUrl;

  // getSession() decodes the JWT from the cookie — no network call on valid token.
  const { data: { session }, error } = await supabase.auth.getSession();

  // Stale refresh token — purge all sb-* cookies and redirect to login.
  if (error && (error.status === 400 || (error as { code?: string }).code === "refresh_token_not_found")) {
    const isAdvisor = pathname.startsWith("/advisor");
    const redirect  = NextResponse.redirect(new URL(isAdvisor ? "/advisor/login" : "/", request.url));
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith("sb-")) redirect.cookies.delete(cookie.name);
    }
    return redirect;
  }

  const isOnboarding       = pathname.startsWith("/onboarding");
  const isDashboard        = pathname.startsWith("/dashboard");
  const isRoot             = pathname === "/";
  const isAdminRoute       = pathname.startsWith("/admin");
  const isAdvisorRoute     = pathname.startsWith("/advisor");
  const isAdvisorPublicPg  = isAdvisorPublic(pathname);
  const isAdvisorProtected = isAdvisorRoute && !isAdvisorPublicPg;

  // ── Unauthenticated ───────────────────────────────────────────────────────
  if (!session) {
    if (isDashboard || isOnboarding || isAdminRoute) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (isAdvisorProtected) {
      // Preserve the intended destination so login can redirect back after auth.
      const loginUrl = new URL("/advisor/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // ── Authenticated — common values ─────────────────────────────────────────
  const role           = session.user.app_metadata?.role;
  const emailConfirmed = !!session.user.email_confirmed_at;
  const isAdvisorUser  = role === "advisor";
  const isAdminUser    = role === "admin";

  // ── Admin observer ─────────────────────────────────────────────────────────
  // Full route access, no onboarding or advisor gates. Read-only enforcement
  // happens at the database layer (SELECT-only RLS policies) — the middleware
  // only handles navigation.
  if (isAdminUser) {
    if (isRoot) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return response;
  }

  // /admin is admin-only — bounce everyone else to their home surface.
  if (isAdminRoute) {
    return NextResponse.redirect(
      new URL(isAdvisorUser ? "/advisor/dashboard" : "/dashboard", request.url)
    );
  }

  // ── Advisor route handling ────────────────────────────────────────────────

  // Advisor public pages (login/signup/verify) while already authenticated:
  //   - Confirmed advisor  → go to advisor dashboard (no re-auth needed)
  //   - Unconfirmed advisor → let them stay on verify; block login/signup
  //   - End-user           → let them see the advisor public pages (different product)
  if (isAdvisorPublicPg) {
    if (isAdvisorUser && emailConfirmed) {
      return NextResponse.redirect(new URL("/advisor/dashboard", request.url));
    }
    if (isAdvisorUser && !emailConfirmed && !pathname.startsWith("/advisor/verify")) {
      return NextResponse.redirect(new URL("/advisor/verify", request.url));
    }
    return response;
  }

  // Protected advisor pages:
  if (isAdvisorProtected) {
    // End-user (not an advisor) trying to access advisor routes.
    if (!isAdvisorUser) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    // Advisor with unverified email — only allow /advisor/verify.
    if (!emailConfirmed) {
      return NextResponse.redirect(new URL("/advisor/verify", request.url));
    }

    // All good — let the advisor through.
    return response;
  }

  // ── End-user route handling ───────────────────────────────────────────────
  // Advisor users should not be landing on the retail dashboard, but it's not
  // a hard block — some advisors may also be retail users.

  const obStep    = request.cookies.get(OB_COOKIE)?.value;
  const isIncomplete = obStep && obStep !== "COMPLETED";
  const stepRoute    = obStep ? STEP_ROUTES[obStep] : null;

  if (isRoot) {
    if (isIncomplete && stepRoute) {
      return NextResponse.redirect(new URL(stepRoute, request.url));
    }
    // Advisors landing at root: send to advisor dashboard.
    if (isAdvisorUser && emailConfirmed) {
      return NextResponse.redirect(new URL("/advisor/dashboard", request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isDashboard && isIncomplete && stepRoute) {
    return NextResponse.redirect(new URL(stepRoute, request.url));
  }

  if (isOnboarding && (!obStep || obStep === "COMPLETED")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
