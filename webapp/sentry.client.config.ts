import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 100% in dev so every request is visible; drop to 0.05 before production
  tracesSampleRate: isDev ? 1.0 : 0.05,

  // Always capture replays on errors; sample 5% of normal sessions
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: isDev ? 1.0 : 0.05,

  // Print Sentry activity to the browser console in dev — remove before prod
  debug: isDev,

  sendDefaultPii: false,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: !isDev,   // unmask in dev so you can read replays easily
      blockAllMedia: false,
    }),
  ],
});
