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
  hideSourceMaps: true,
  // Skip source-map upload and the heavy Sentry webpack plugin in dev —
  // this is the single biggest compile-time win for local development.
  disableClientWebpackPlugin: !isProd,
  disableServerWebpackPlugin: !isProd,
});
