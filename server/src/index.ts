// Must stay the first import, so Sentry is set up before anything else loads
import "./instrument.ts";
import { app } from "./app.ts";
import { startJobs, stopJobs } from "./lib/jobs.ts";
import * as Sentry from "@sentry/bun";
import { error } from "node:console";


const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

// After listen, and never fatal: e2e starts this server before its database exists. Inbound email
// still works if jobs fail to start; queuing a classification then fails and is logged.
startJobs().catch((err) => console.error("Could not start background jobs", err));

// Let a running job finish (pg-boss waits up to 30s) before exiting
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    server.close();
    await stopJobs();
    // Send any queued error events before exiting
    await Sentry.close(2000);
    process.exit(0);
  });
}
