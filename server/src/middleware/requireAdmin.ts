import type { NextFunction, Request, Response } from "express";
import type { AuthLocals } from "./requireAuth.ts";

// Mount after requireAuth: rejects signed-in users who aren't admins
export function requireAdmin(_req: Request, res: Response<unknown, AuthLocals>, next: NextFunction) {
  if (res.locals.user.role !== "ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
