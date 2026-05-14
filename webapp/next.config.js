const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,  // required for Sentry in Next.js 14
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  disableLogger: true,
  hideSourceMaps: true,
  // tunnelRoute removed: it only works after `next build`, not `next dev`.
  // Events sent to /monitoring return 404 in dev and are silently dropped.
});
