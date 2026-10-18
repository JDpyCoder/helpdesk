import * as Sentry from "@sentry/bun";

// Error reporting to Sentry. Imported first by index.ts, so it runs before any other module loads.
// Off while SENTRY_DSN is unset (local dev without a project, unit tests, e2e).
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
    // Errors only, no performance tracing
    tracesSampleRate: 0,
    // Every console.error also goes to Sentry: the 500 handler, job queue failures, Gemini failures and
    // the health check all log there, so they are reported without Sentry calls at each site.
    // An Error among the arguments is sent as an exception (with its stack), otherwise as a message.
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
  });
}
