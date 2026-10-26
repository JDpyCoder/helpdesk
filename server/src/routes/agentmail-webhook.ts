import { inboundEmailSchema } from "core";
import { type Request, type Response, Router } from "express";
import { Webhook, WebhookVerificationError } from "svix";
import { prisma } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { EmailStatus } from "../generated/prisma/enums.ts";
import {
  agentmailInboxId,
  type AgentmailEvent,
  InvalidEventError,
  maskEmail,
  messageBody,
  parseAddress,
  parseAgentmailEvent,
} from "../lib/agentmail.ts";
import { ingestEmail } from "../lib/ingest-email.ts";
import { enqueueTicketClassification } from "../lib/jobs.ts";
import { isUniqueViolation } from "./inbound-email.ts";

// AgentMail webhook: mounted at /api/webhooks/agentmail with express.raw (see app.ts), since the Svix signature
// covers the exact bytes. Public, so nothing happens before the signature checks out.
// AgentMail delivers at least once and out of order, retries any non-2xx, and needs an answer within 15 seconds:
// each event is processed once (by event_id, in the same transaction as its work), and a failure answers 5xx
// so it is redelivered.
export const agentmailWebhookRouter = Router();

// The body limit of the email schema; longer emails are cut rather than lost
const MAX_BODY_LENGTH = 100_000;
// A delivery event can beat our own write of the reply's AgentMail id by a moment; until then it's retried
const UNMATCHED_RETRY_WINDOW_MS = 2 * 60 * 1000;

// Message-IDs look like <id@host>; AgentMail's message id is stored as one only when it has that form
const rfcMessageId = /^<[^<>\s]+@[^<>\s]+>$/;

class RetryLater extends Error {}

agentmailWebhookRouter.post("/", async (req: Request, res: Response) => {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) {
    res.status(503).json({ error: "AgentMail webhook is not configured" });
    return;
  }
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Expected a JSON body" });
    return;
  }

  const payload = req.body.toString("utf8");
  try {
    // Throws on a missing, wrong or expired (over 5 minutes old) signature; returns nothing in svix 2.x
    new Webhook(secret).verify(payload, {
      "svix-id": req.header("svix-id") ?? "",
      "svix-timestamp": req.header("svix-timestamp") ?? "",
      "svix-signature": req.header("svix-signature") ?? "",
    });
  } catch (err) {
    if (!(err instanceof WebhookVerificationError)) throw err;
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let event: AgentmailEvent;
  try {
    event = parseAgentmailEvent(JSON.parse(payload));
  } catch (err) {
    if (!(err instanceof InvalidEventError || err instanceof SyntaxError)) throw err;
    // Answered 500 so AgentMail keeps it (and redelivers it) while the parsing is fixed
    console.error(`AgentMail webhook: ${err.message}`);
    res.status(500).json({ error: "Could not read the event" });
    return;
  }
  if (event.eventType === "ignored") {
    res.status(204).end();
    return;
  }

  try {
    const outcome = await handleEvent(event);
    if (outcome.ticketId && outcome.created) await enqueueTicketClassification(outcome.ticketId);
    res.status(outcome.status).json(outcome.body);
  } catch (err) {
    if (err instanceof RetryLater) {
      res.status(503).json({ error: err.message });
      return;
    }
    // Another delivery of the same event (or another email of the same new thread) won the race. A processed event
    // is acknowledged; otherwise AgentMail retries, and the retry finds the ticket the other delivery created.
    if (isUniqueViolation(err)) {
      const done = await prisma.agentmailEvent.findUnique({ where: { eventId: event.eventId } });
      if (done) {
        res.json({ duplicate: true });
        return;
      }
    }
    console.error(`AgentMail webhook: processing ${event.eventType} ${event.eventId} failed`, err);
    res.status(500).json({ error: "Could not process the event" });
  }
});

type Outcome = { status: number; body: unknown; ticketId?: number; created?: boolean };

const ignored: Outcome = { status: 204, body: undefined };

async function handleEvent(event: Exclude<AgentmailEvent, { eventType: "ignored" }>): Promise<Outcome> {
  const inbox = agentmailInboxId();

  if (event.eventType === "message.received") {
    const { message } = event;
    if (!inbox || message.inboxId.toLowerCase() !== inbox) return ignored;
    const from = parseAddress(message.from);
    // Our own address writing to itself would open a ticket per reply
    if (from.email === inbox) return ignored;

    // Before the transaction: a large body is fetched from the API, which mustn't hold a database transaction open
    const body = (await messageBody(message)).slice(0, MAX_BODY_LENGTH);
    const parsed = inboundEmailSchema.safeParse({
      from,
      subject: (message.subject ?? "").slice(0, 998),
      text: body,
      messageId: rfcMessageId.test(message.messageId) ? message.messageId : undefined,
      inReplyTo: message.inReplyTo && rfcMessageId.test(message.inReplyTo) ? message.inReplyTo : undefined,
      references: message.references?.filter((id) => rfcMessageId.test(id)).slice(-100),
      receivedAt: message.timestamp.toISOString(),
    });
    if (!parsed.success) {
      // Nothing a retry could fix (e.g. a sender with no valid address)
      console.warn(`AgentMail webhook: ignoring message ${message.messageId} from ${maskEmail(from.email)}: invalid email`);
      return ignored;
    }

    return prisma.$transaction(async (tx) => {
      if (await alreadyProcessed(tx, event)) return { status: 200, body: { duplicate: true } };
      const result = await ingestEmail(tx, parsed.data, { threadId: message.threadId, messageId: message.messageId });
      console.log(
        `AgentMail webhook: message from ${maskEmail(from.email)} ${result.created ? "opened" : "joined"} ticket ${result.ticketId}`,
      );
      return {
        status: result.created ? 201 : 200,
        body: { ticketId: result.ticketId, created: result.created, ...(result.duplicate && { duplicate: true }) },
        ticketId: result.ticketId,
        created: result.created,
      };
    });
  }

  // Delivery events for a reply we sent: find it by AgentMail's message id
  const { status, emailError, info } = deliveryChange(event);
  if (!inbox || info.inboxId.toLowerCase() !== inbox) return ignored;

  return prisma.$transaction(async (tx) => {
    if (await alreadyProcessed(tx, event)) return { status: 200, body: { duplicate: true } };
    const reply = await tx.ticketMessage.findUnique({
      where: { agentmailMessageId: info.messageId },
      select: { id: true, emailStatus: true },
    });
    if (!reply) {
      // Rolled back, so a retry can still match it once the send has stored the id
      if (Date.now() - info.timestamp.getTime() < UNMATCHED_RETRY_WINDOW_MS) {
        throw new RetryLater("Reply not stored yet");
      }
      return ignored; // Mail sent some other way, e.g. from the AgentMail console
    }
    if (!canMoveTo(reply.emailStatus, status)) return { status: 200, body: { unchanged: true } };
    await tx.ticketMessage.update({
      where: { id: reply.id },
      data: { emailStatus: status, ...(emailError !== undefined && { emailError }) },
    });
    return { status: 200, body: { emailStatus: status } };
  });
}

// Records the event; false the first time, true if it was already processed (its work is then skipped)
async function alreadyProcessed(tx: Prisma.TransactionClient, event: { eventId: string; eventType: string }) {
  const { count } = await tx.agentmailEvent.createMany({
    data: [{ eventId: event.eventId, eventType: event.eventType }],
    skipDuplicates: true,
  });
  return count === 0;
}

type DeliveryEvent = Extract<
  AgentmailEvent,
  { eventType: "message.sent" | "message.delivered" | "message.bounced" | "message.rejected" }
>;

function deliveryChange(event: DeliveryEvent) {
  switch (event.eventType) {
    case "message.sent":
      return { status: EmailStatus.SENT, emailError: null, info: event.send };
    case "message.delivered":
      return { status: EmailStatus.DELIVERED, emailError: null, info: event.delivery };
    case "message.bounced":
      return {
        status: EmailStatus.BOUNCED,
        emailError: `The email bounced (${[event.bounce.type, event.bounce.subType].filter(Boolean).join(", ")})`,
        info: event.bounce,
      };
    case "message.rejected":
      return {
        status: EmailStatus.REJECTED,
        emailError: `AgentMail rejected the email${event.reject.reason ? ` (${event.reject.reason.slice(0, 200)})` : ""}`,
        info: event.reject,
      };
  }
}

// Events arrive out of order, so a status only moves forward: bounced/rejected are final, and a late
// "sent" never replaces "delivered"
const rank: Record<EmailStatus, number> = {
  [EmailStatus.PENDING]: 0,
  [EmailStatus.FAILED]: 0,
  [EmailStatus.SENT]: 1,
  [EmailStatus.DELIVERED]: 2,
  [EmailStatus.BOUNCED]: 3,
  [EmailStatus.REJECTED]: 3,
};

function canMoveTo(current: EmailStatus | null, next: EmailStatus) {
  return current === null ? false : rank[next] > rank[current];
}
