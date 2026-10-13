import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

// Guards the inbound email webhook: the sender must present INBOUND_EMAIL_SECRET as a bearer token.
// Without the variable the endpoint is off (503) rather than open.
export function requireInboundSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INBOUND_EMAIL_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Inbound email is not configured" });
    return;
  }

  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const expected = Buffer.from(secret);
  const given = Buffer.from(token);
  // timingSafeEqual throws on unequal lengths, so check that first
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
