import * as Sentry from '@sentry/react'

// Error reporting to Sentry. Imported first by main.tsx; React errors reach it through the
// error hooks on createRoot. Off while VITE_SENTRY_DSN is unset (local dev, component tests, e2e).
const dsn = import.meta.env.VITE_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
    // Errors only, no performance tracing or session replay
    tracesSampleRate: 0,
  })
}
