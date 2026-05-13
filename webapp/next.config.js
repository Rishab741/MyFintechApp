const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSentryConfig(nextConfig, {
  // Suppresses source map upload logs during build
  silent: true,
  // Upload source maps so Sentry shows readable stack traces
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Automatically tree-shake Sentry logger statements in production
  disableLogger: true,
  // Hides source maps from browser devtools (security)
  hideSourceMaps: true,
  // Tunnel Sentry requests through /monitoring to avoid ad-blockers
  tunnelRoute: "/monitoring",
});
