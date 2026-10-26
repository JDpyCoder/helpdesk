import { AgentMail, AgentMailClient, AgentMailError, AgentMailTimeoutError, serialization } from "agentmail";
import { prisma } from "../db.ts";
import { EmailStatus, SenderType } from "../generated/prisma/enums.ts";

// AgentMail (https://agentmail.to): customers email the support inbox, and agent replies to tickets that came
// from it are emailed back in the same thread. Email is on only while both variables are set.
export function isEmailConfigured() {
  return Boolean(process.env.AGENTMAIL_API_KEY && process.env.AGENTMAIL_INBOX_ID);
}

// The inbox id is the inbox's address (e.g. support@agentmail.to); compared case-insensitively
export function agentmailInboxId() {
  return process.env.AGENTMAIL_INBOX_ID?.trim().toLowerCase() ?? "";
}

let client: AgentMailClient | undefined;

export function agentmailClient() {
  // No SDK retries: a send is retried by the agent (Retry sending), and webhook work by AgentMail's redelivery.
  // The timeout keeps the reply request, and the webhook's 15 seconds, from hanging on a slow API.
  client ??= new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY, maxRetries: 0, timeoutInSeconds: 10 });
  return client;
}

// Addresses in logs are masked (j***@gmail.com); bodies, subjects and signatures are never logged
export function maskEmail(address: string) {
  const [local = "", domain = ""] = address.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

// ---- Webhook events ----

export type AgentmailEvent =
  | { eventType: "message.received"; eventId: string; message: AgentMail.Message }
  | { eventType: "message.sent"; eventId: string; send: AgentMail.Send }
  | { eventType: "message.delivered"; eventId: string; delivery: AgentMail.Delivery }
  | { eventType: "message.bounced"; eventId: string; bounce: AgentMail.Bounce }
  | { eventType: "message.rejected"; eventId: string; reject: AgentMail.Reject }
  // Spam/blocked/unauthenticated mail, opens, calendar events…: acknowledged and ignored
  | { eventType: "ignored"; eventId: string; type: string };

const schemas = {
  "message.received": serialization.MessageReceivedEvent,
  "message.sent": serialization.MessageSentEvent,
  "message.delivered": serialization.MessageDeliveredEvent,
  "message.bounced": serialization.MessageBouncedEvent,
  "message.rejected": serialization.MessageRejectedEvent,
} as const;

export class InvalidEventError extends Error {}

// Parses a verified webhook body with the SDK's own schemas (snake_case JSON → typed camelCase objects).
// Fields the SDK doesn't know yet (body_url, …) are kept rather than rejected.
export function parseAgentmailEvent(raw: unknown): AgentmailEvent {
  if (typeof raw !== "object" || raw === null) throw new InvalidEventError("Event is not an object");
  const { event_type: type, event_id: eventId } = raw as { event_type?: unknown; event_id?: unknown };
  if (typeof type !== "string" || typeof eventId !== "string" || !eventId) {
    throw new InvalidEventError("Event has no event_type or event_id");
  }
  if (!(type in schemas)) return { eventType: "ignored", eventId, type };

  // Some AgentMail pages show the sender as `from_`; the API and the SDK use `from`
  const message = (raw as { message?: Record<string, unknown> }).message;
  if (message && message.from === undefined && message.from_ !== undefined) {
    raw = { ...raw, message: { ...message, from: message.from_ } };
  }
  const parsed = schemas[type as keyof typeof schemas].parse(raw, {
    unrecognizedObjectKeys: "passthrough",
    allowUnrecognizedEnumValues: true,
    allowUnrecognizedUnionMembers: true,
  });
  if (!parsed.ok) {
    // Paths only: the values are email content
    throw new InvalidEventError(`Unexpected ${type} payload at ${parsed.errors.map((e) => e.path.join(".")).join(", ")}`);
  }
  return parsed.value as AgentmailEvent;
}

// ---- Received messages ----

// "Jane Doe <jane@example.com>" or a bare address; a missing name falls back to the address's local part
export function parseAddress(value: string): { email: string; name: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^<>]+)>\s*$/.exec(value);
  const email = (match ? match[2]! : value).trim().toLowerCase();
  const name = match?.[1]?.trim() || email.split("@")[0] || email;
  return { email, name };
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// Turns an HTML-only email into plain text. The app stores and shows plain text only (rendered as React text,
// never as HTML), so nothing from the email's markup, scripts or styles can run or load in the browser.
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|head|title)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|h[1-6]|tr|table|blockquote|ul|ol)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] === "#") {
        const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
      }
      return entities[code.toLowerCase()] ?? entity;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The ticket shows the new part of an email: extracted_text leaves out the quoted history of a reply.
// Falls back to the full text, then to the HTML as text.
function bodyOf(message: AgentMail.Message) {
  if (message.extractedText?.trim()) return message.extractedText;
  if (message.text?.trim()) return message.text;
  const html = message.extractedHtml || message.html;
  return html ? htmlToText(html) : undefined;
}

// Bodies over 64 KiB aren't in the webhook payload (it has body_url instead); the API always has them
export async function messageBody(message: AgentMail.Message) {
  const inline = bodyOf(message);
  if (inline !== undefined) return inline;
  const full = await agentmailClient().inboxes.messages.get(message.inboxId, message.messageId);
  return bodyOf(full) ?? "";
}

// ---- Sending replies ----

// A short reason for the agent: no addresses, content or raw API bodies
export function sendErrorReason(err: unknown) {
  if (err instanceof AgentMailTimeoutError) return "AgentMail did not answer in time";
  if (err instanceof AgentMailError && err.statusCode) {
    if (err.statusCode === 429) return "AgentMail's sending limit was reached (HTTP 429)";
    if (err.statusCode === 401 || err.statusCode === 403) return `AgentMail refused the API key (HTTP ${err.statusCode})`;
    if (err.statusCode === 404) return "AgentMail no longer has the customer's email (HTTP 404)";
    return `AgentMail could not send the email (HTTP ${err.statusCode})`;
  }
  return "Could not reach AgentMail";
}

// Emails a stored PENDING reply as a reply to the ticket's latest customer email, so it stays in their thread.
// Marks it SENT (with AgentMail's id, which delivery events refer to) or FAILED with a reason; never throws for a
// send failure. The idempotency key is per reply, so a retry of a send that did go out isn't sent twice.
export async function sendReplyEmail(ticketMessageId: number) {
  const reply = await prisma.ticketMessage.findUnique({
    where: { id: ticketMessageId },
    select: { id: true, body: true, emailStatus: true, ticketId: true },
  });
  if (!reply || reply.emailStatus !== EmailStatus.PENDING) return;

  const fail = (emailError: string) =>
    prisma.ticketMessage.updateMany({
      where: { id: reply.id, emailStatus: EmailStatus.PENDING },
      data: { emailStatus: EmailStatus.FAILED, emailError },
    });

  if (!isEmailConfigured()) {
    await fail("Email sending is not configured");
    return;
  }
  const target = await prisma.ticketMessage.findFirst({
    where: { ticketId: reply.ticketId, senderType: SenderType.CUSTOMER, agentmailMessageId: { not: null } },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    select: { agentmailMessageId: true },
  });
  if (!target?.agentmailMessageId) {
    await fail("The ticket has no customer email to reply to");
    return;
  }

  let sent: AgentMail.SendMessageResponse;
  try {
    sent = await agentmailClient().inboxes.messages.reply(
      agentmailInboxId(),
      target.agentmailMessageId,
      { text: reply.body },
      { idempotencyKey: `ticket-message-${reply.id}` },
    );
  } catch (err) {
    const reason = sendErrorReason(err);
    // The SDK error carries the request, so only the reason is logged
    console.error(`Could not email reply ${reply.id} of ticket ${reply.ticketId}: ${reason}`);
    await fail(reason);
    return;
  }
  await prisma.ticketMessage.updateMany({
    where: { id: reply.id, emailStatus: EmailStatus.PENDING },
    data: { emailStatus: EmailStatus.SENT, emailError: null, agentmailMessageId: sent.messageId },
  });
}
