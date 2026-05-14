import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: isDev ? 1.0 : 0.05,
  debug: isDev,
  sendDefaultPii: false,
});
