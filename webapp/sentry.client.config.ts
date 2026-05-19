import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 100% in dev so every request is visible; drop to 0.05 before production
  tracesSampleRate: isDev ? 1.0 : 0.05,

  // Always capture replays on errors; sample 5% of normal sessions
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: isDev ? 1.0 : 0.05,

  // debug: true requires the Sentry debug bundle which isn't included in prod builds.
  // Keep it off to avoid the console warning.
  debug: false,

  sendDefaultPii: false,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: !isDev,   // unmask in dev so you can read replays easily
      blockAllMedia: false,
    }),
  ],
});
