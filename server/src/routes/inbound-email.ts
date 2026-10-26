import { inboundEmailSchema } from "core";
import { Router } from "express";
import { prisma } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { findDuplicate, ingestEmail } from "../lib/ingest-email.ts";
import { enqueueTicketAutoResolution, enqueueTicketClassification } from "../lib/jobs.ts";
import { sendValidationError } from "../lib/validation.ts";

// Inbound email webhook: mounted at /api/inbound-email behind requireInboundSecret (see app.ts).
// Each email either opens a new ticket or, when it replies to a known message, joins that ticket.
export const inboundEmailRouter = Router();

export function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

inboundEmailRouter.post("/", async (req, res) => {
  const parsed = inboundEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  let result;
  try {
    result = await prisma.$transaction((tx) => ingestEmail(tx, parsed.data));
  } catch (err) {
    // Two deliveries of the same email raced past the duplicate check; the other one stored it
    const raced = isUniqueViolation(err) ? await findDuplicate(prisma, parsed.data.messageId) : null;
    if (!raced) throw err;
    res.json({ ticketId: raced.ticketId, created: false, duplicate: true });
    return;
  }

  const { ticketId, created, duplicate, autoResolve } = result;
  if (duplicate) {
    res.json({ ticketId, created: false, duplicate: true });
    return;
  }
  if (!created) {
    res.json({ ticketId, created: false });
    return;
  }
  // Only queued here (quick inserts); the pg-boss workers call Gemini later
  await enqueueTicketClassification(ticketId);
  if (autoResolve) await enqueueTicketAutoResolution(ticketId);
  res.status(201).json({ ticketId, created: true });
});
