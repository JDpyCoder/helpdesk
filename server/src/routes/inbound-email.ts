import { inboundEmailSchema } from "core";
import { Router } from "express";
import { prisma } from "../db.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { SenderType, TicketStatus } from "../generated/prisma/enums.ts";
import { sendValidationError } from "../lib/validation.ts";

// Inbound email webhook: mounted at /api/inbound-email behind requireInboundSecret (see app.ts).
// Each email either opens a new ticket or, when it replies to a known message, joins that ticket.
export const inboundEmailRouter = Router();

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

inboundEmailRouter.post("/", async (req, res) => {
  const parsed = inboundEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const { from, subject, text, messageId, inReplyTo, references, receivedAt } = parsed.data;

  // Senders retry webhooks: an email we already stored is acknowledged, not stored twice
  const findDuplicate = () =>
    messageId
      ? prisma.ticketMessage.findUnique({ where: { messageId }, select: { ticketId: true } })
      : null;
  const duplicate = await findDuplicate();
  if (duplicate) {
    res.json({ ticketId: duplicate.ticketId, created: false, duplicate: true });
    return;
  }

  const message = {
    messageId,
    senderType: SenderType.CUSTOMER,
    fromEmail: from.email,
    fromName: from.name,
    body: text,
    ...(receivedAt && { receivedAt: new Date(receivedAt) }),
  };

  try {
    // A reply names earlier messages in In-Reply-To / References; join the ticket of the one stored last.
    // Order by our own id, not receivedAt, which the sender can set.
    const threadIds = [...new Set([inReplyTo, ...(references ?? [])].filter((id) => id !== undefined))];
    const parent =
      threadIds.length > 0
        ? await prisma.ticketMessage.findFirst({
            where: { messageId: { in: threadIds } },
            orderBy: { id: "desc" },
            select: { ticketId: true },
          })
        : null;

    if (parent) {
      // The customer wrote back, so a resolved or closed ticket needs attention again
      await prisma.ticket.update({
        where: { id: parent.ticketId },
        data: { status: TicketStatus.OPEN, messages: { create: message } },
      });
      res.json({ ticketId: parent.ticketId, created: false });
      return;
    }

    const ticket = await prisma.ticket.create({
      data: { subject, fromEmail: from.email, fromName: from.name, messages: { create: message } },
      select: { id: true },
    });
    res.status(201).json({ ticketId: ticket.id, created: true });
  } catch (err) {
    // Two deliveries of the same email raced past the duplicate check; the other one stored it
    const raced = isUniqueViolation(err) ? await findDuplicate() : null;
    if (!raced) throw err;
    res.json({ ticketId: raced.ticketId, created: false, duplicate: true });
  }
});
