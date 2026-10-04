import express, { type NextFunction, type Request, type Response } from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.ts";
import { prisma } from "./db.ts";
import { requireAuth, type AuthLocals } from "./middleware/requireAuth.ts";

export const app = express();

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
  res.json({ user: res.locals.user, session: res.locals.session });
});

// 404 for unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

// Express 5 forwards rejected promises from async handlers here automatically
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});
