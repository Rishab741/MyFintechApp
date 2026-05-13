import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 5% of sessions as replays (shows exactly what the user saw)
  replaysSessionSampleRate: 0.05,
  // Always capture replays when an error occurs
  replaysOnErrorSampleRate: 1.0,

  // Trace 5% of requests for performance monitoring
  tracesSampleRate: 0.05,

  // GDPR: do not send PII — no user emails, no IP addresses
  sendDefaultPii: false,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,        // mask all text content in replays
      blockAllMedia: true,      // block all images/video in replays
    }),
  ],
});
