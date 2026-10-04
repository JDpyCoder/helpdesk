import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth.ts";

export type AuthSession = typeof auth.$Infer.Session;

export type AuthLocals = {
  user: AuthSession["user"];
  session: AuthSession["session"];
};

// Rejects unauthenticated requests; on success exposes the user and session on res.locals
export async function requireAuth(req: Request, res: Response<unknown, AuthLocals>, next: NextFunction) {
  const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!result) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.locals.user = result.user;
  res.locals.session = result.session;
  next();
}
