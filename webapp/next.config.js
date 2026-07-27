const { withSentryConfig } = require("@sentry/nextjs");

const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Performance ─────────────────────────────────────────────────────────────
  compress: true,
  poweredByHeader: false,

  // Tree-shake large icon / charting libraries at compile time.
  // This alone cuts first-compile time by ~30% on heavy client pages.
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "@supabase/ssr"],
    instrumentationHook: isProd, // only needed for Sentry in production
  },

  // ── Security headers ────────────────────────────────────────────────────────
  // Deliberately no Content-Security-Policy yet: a wrong CSP silently breaks
  // Supabase/Sentry network calls or third-party embeds in production rather
  // than failing loudly in dev, so it needs its own pass enumerating every
  // external origin this app actually talks to, not a guess shipped alongside
  // unrelated changes. These four are safe defaults with no such risk.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(isProd
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  org:     process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent:  true,
  disableLogger: true,
  // Source-map upload + release creation are DISABLED: the current
  // SENTRY_AUTH_TOKEN belongs to org "no-g60", which has no project matching
  // SENTRY_PROJECT — sentry-cli hard-fails the whole build on this mismatch.
  // Runtime error reporting via the DSN is unaffected. To re-enable: issue a
  // token from the org that owns the project (Sentry → Settings → Auth
  // Tokens), align SENTRY_ORG/PROJECT, then remove these two blocks.
  sourcemaps: { disable: true },
  release:    { create: false, finalize: false },
});
