import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // getSession() reads the JWT from the cookie — no network call when the
  // access token is still valid. It only hits the network when the access
  // token is expired and needs refreshing. This is the right choice for
  // middleware: fast path stays in-process; getUser() (used in Server
  // Components) handles server-side JWT verification on actual page loads.
  const { data: { session }, error } = await supabase.auth.getSession();

  // Stale refresh token — the user has a cookie from a session that was
  // revoked or expired server-side. Delete all Supabase auth cookies and
  // redirect to login so the browser doesn't hammer the refresh endpoint
  // on every subsequent request.
  if (error && (error.status === 400 || (error as any).code === "refresh_token_not_found")) {
    const loginUrl = new URL("/", request.url);
    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.startsWith("sb-")) {
        redirect.cookies.delete(cookie.name);
      }
    }
    return redirect;
  }

  // Unauthenticated → login
  if (!session && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Already authenticated → skip the login page
  if (session && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  // Exclude static assets, images, favicon, and Next.js API routes.
  // Also exclude the Supabase auth callback route so cookies can be set.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
