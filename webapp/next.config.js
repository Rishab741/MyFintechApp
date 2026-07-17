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
