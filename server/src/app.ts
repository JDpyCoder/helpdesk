import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.ts";
import { prisma } from "./db.ts";
import { requireAuth, type AuthLocals } from "./middleware/requireAuth.ts";
import { requireInboundSecret } from "./middleware/requireInboundSecret.ts";
import { inboundEmailRouter } from "./routes/inbound-email.ts";
import { agentmailWebhookRouter } from "./routes/agentmail-webhook.ts";
import { agentsRouter } from "./routes/agents.ts";
import { dashboardRouter } from "./routes/dashboard.ts";
import { ticketsRouter } from "./routes/tickets.ts";
import { usersRouter } from "./routes/users.ts";

export const app = express();

// Security headers (nosniff, frame-ancestors, HSTS, CSP, ...) on every response, auth routes included.
// The CSP's defaults fit the built client (scripts, styles and fonts from this origin, no inline scripts);
// connect-src also allows Sentry, where the client reports errors.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { connectSrc: ["'self'", "https://*.sentry.io"] },
    },
  })
);

// Only proxies listed here may set X-Forwarded-For; default is the local Vite dev proxy
// (env values are strings, so map "true"/"false"/hop counts to what Express expects)
const trustProxy = process.env.TRUST_PROXY ?? "loopback";
app.set(
  "trust proxy",
  trustProxy === "true" ? true : trustProxy === "false" ? false : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy
);

// Some platforms pass the client IP in their own header instead of X-Forwarded-For (Railway's edge
// sets X-Real-IP, Render's True-Client-IP). Only set CLIENT_IP_HEADER when every request comes through that proxy, which
// overwrites the header, since a client could otherwise send it themselves.
const clientIpHeader = process.env.CLIENT_IP_HEADER?.toLowerCase();

function clientIp(req: Request): string | undefined {
  if (!clientIpHeader) return req.ip;
  const value = req.headers[clientIpHeader];
  return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim() || undefined;
}

// Hand Better Auth the client IP resolved above, in a header it reads exclusively.
// Overwriting it means a client can't spoof its way into a fresh rate-limit bucket.
app.use((req, _res, next) => {
  const ip = clientIp(req);
  if (ip) req.headers["x-client-ip"] = ip;
  else delete req.headers["x-client-ip"];
  next();
});

// Better Auth reads the raw body itself, so it must be mounted before express.json()
app.all("/api/auth/*splat", toNodeHandler(auth));

// Emails can outgrow the default 100kb JSON limit, so this route parses its own body —
// and only after the secret checks out, so unauthenticated callers can't make us parse 1mb
app.use("/api/inbound-email", requireInboundSecret, express.json({ limit: "1mb" }), inboundEmailRouter);

// AgentMail's Svix signature covers the exact bytes, so this route gets the raw body (any content type) and
// verifies it before parsing. Bodies over 64 KiB aren't in the payload, so 2mb leaves room for the thread.
app.use("/api/webhooks/agentmail", express.raw({ type: () => true, limit: "2mb" }), agentmailWebhookRouter);

app.use(express.json());

app.get("/api/health", async (_req, res) => {
  let database: "ok" | "unreachable" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("Database health check failed:", err);
    database = "unreachable";
  }

  res.status(database === "ok" ? 200 : 503).json({
    status: database === "ok" ? "ok" : "degraded",
    database,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/me", requireAuth, (_req, res: Response<unknown, AuthLocals>) => {
  // Never echo the session token: it's the bearer credential the httpOnly cookie protects
  const { token: _token, ...session } = res.locals.session;
  res.json({ user: res.locals.user, session });
});

app.use("/api/users", usersRouter);
app.use("/api/tickets", ticketsRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/dashboard", dashboardRouter);

// 404 for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

// In production this server also serves the built client (`bun run build` → client/dist), so the app and
// the API share one origin and the session cookie needs no CORS. In development Vite serves the client.
const clientDist = fileURLToPath(new URL("../../client/dist", import.meta.url));
if (process.env.NODE_ENV === "production" && existsSync(path.join(clientDist, "index.html"))) {
  // Vite puts a content hash in every asset name, so they can be cached forever
  app.use("/assets", express.static(path.join(clientDist, "assets"), { immutable: true, maxAge: "1y" }));
  app.use("/assets", (_req, res) => {
    res.status(404).end();
  });
  app.use(express.static(clientDist, { index: false }));
  // Every other GET is a client route (/tickets/42, ...): send the app and let React Router handle it.
  // no-cache so a new deploy's index.html, with its new asset names, is picked up right away.
  app.get("/{*splat}", (_req, res) => {
    res.set("Cache-Control", "no-cache").sendFile(path.join(clientDist, "index.html"));
  });
}

// Express 5 forwards rejected promises from async handlers here automatically
app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  // Body-parser rejections (malformed JSON, body too large) are the client's fault: pass on their 4xx
  if (err.type?.startsWith("entity.") && err.status && err.status < 500) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});
