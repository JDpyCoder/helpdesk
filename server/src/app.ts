import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.ts";
import { prisma } from "./db.ts";
import { requireAuth, type AuthLocals } from "./middleware/requireAuth.ts";
import { usersRouter } from "./routes/users.ts";

export const app = express();

// Security headers (nosniff, frame-ancestors, HSTS, ...) on every response, auth routes included
app.use(helmet());

// Only proxies listed here may set X-Forwarded-For; default is the local Vite dev proxy
// (env values are strings, so map "true"/"false"/hop counts to what Express expects)
const trustProxy = process.env.TRUST_PROXY ?? "loopback";
app.set(
  "trust proxy",
  trustProxy === "true" ? true : trustProxy === "false" ? false : /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy
);

// Hand Better Auth the client IP Express resolved above, in a header it reads exclusively.
// Overwriting it means a client can't spoof its way into a fresh rate-limit bucket.
app.use((req, _res, next) => {
  if (req.ip) req.headers["x-client-ip"] = req.ip;
  else delete req.headers["x-client-ip"];
  next();
});

// Better Auth reads the raw body itself, so it must be mounted before express.json()
app.all("/api/auth/*splat", toNodeHandler(auth));

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

// 404 for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

// Express 5 forwards rejected promises from async handlers here automatically
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});
