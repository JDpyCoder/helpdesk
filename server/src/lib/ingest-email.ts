import type { InboundEmailInput } from "core";
import type { Prisma } from "../generated/prisma/client.ts";
import { SenderType, TicketStatus } from "../generated/prisma/enums.ts";
import { getAiAgentId } from "./ai-agent.ts";
import { isAutoResolveConfigured } from "./auto-resolve-ticket.ts";

// Where an email came from in AgentMail: its thread is the ticket, its id is what a reply answers
export type AgentmailIds = { threadId: string; messageId: string };

export type IngestResult = {
  ticketId: number;
  created: boolean;
  duplicate?: boolean;
  // Set for a new ticket the AI should try to answer (queued by the caller, after the transaction)
  autoResolve?: boolean;
};

// Stores one received email inside the caller's transaction: a duplicate is acknowledged, a reply joins its
// ticket (AgentMail thread first, then In-Reply-To / References), anything else opens a ticket.
// Used by POST /api/inbound-email and the AgentMail webhook.
export async function ingestEmail(
  tx: Prisma.TransactionClient,
  email: InboundEmailInput,
  agentmail?: AgentmailIds,
): Promise<IngestResult> {
  const { from, subject, text, messageId, inReplyTo, references, receivedAt } = email;

  // Senders retry webhooks: an email we already stored is acknowledged, not stored twice
  const duplicate = await findDuplicate(tx, messageId, agentmail?.messageId);
  if (duplicate) return { ticketId: duplicate.ticketId, created: false, duplicate: true };

  const message = {
    messageId,
    agentmailMessageId: agentmail?.messageId,
    senderType: SenderType.CUSTOMER,
    fromEmail: from.email,
    fromName: from.name,
    body: text,
    ...(receivedAt && { receivedAt: new Date(receivedAt) }),
  };

  const parent = await findParentTicket(tx, inReplyTo, references, agentmail?.threadId);
  if (parent) {
    // The customer wrote back, so a resolved or closed ticket needs attention again — from a person,
    // so a ticket the AI resolved leaves the AI Agent
    const aiAgentId = await getAiAgentId();
    await tx.ticket.update({
      where: { id: parent.ticketId },
      data: { status: TicketStatus.OPEN, resolvedAt: null, messages: { create: message } },
    });
    if (aiAgentId) {
      await tx.ticket.updateMany({
        where: { id: parent.ticketId, assignedToId: aiAgentId },
        data: { assignedToId: null },
      });
    }
    return { ticketId: parent.ticketId, created: false };
  }

  // With a knowledge base, the ticket starts NEW and the AI tries to answer it first (see auto-resolve-ticket.ts)
  // and the ticket belongs to the AI Agent until it is resolved or released. Tickets from AgentMail always go to
  // the agents: the AI never emails a customer by itself.
  const autoResolve = !agentmail && isAutoResolveConfigured();
  const ticket = await tx.ticket.create({
    data: {
      subject,
      fromEmail: from.email,
      fromName: from.name,
      agentmailThreadId: agentmail?.threadId,
      status: autoResolve ? TicketStatus.NEW : TicketStatus.OPEN,
      assignedToId: autoResolve ? await getAiAgentId() : null,
      messages: { create: message },
    },
    select: { id: true },
  });
  return { ticketId: ticket.id, created: true, autoResolve };
}

export function findDuplicate(db: Prisma.TransactionClient, messageId?: string, agentmailMessageId?: string) {
  const ids = [
    ...(messageId ? [{ messageId }] : []),
    ...(agentmailMessageId ? [{ agentmailMessageId }] : []),
  ];
  if (ids.length === 0) return null;
  return db.ticketMessage.findFirst({ where: { OR: ids }, select: { ticketId: true } });
}

async function findParentTicket(
  tx: Prisma.TransactionClient,
  inReplyTo: string | undefined,
  references: string[] | undefined,
  threadId: string | undefined,
) {
  if (threadId) {
    const ticket = await tx.ticket.findUnique({ where: { agentmailThreadId: threadId }, select: { id: true } });
    if (ticket) return { ticketId: ticket.id };
  }
  // A reply names earlier messages in In-Reply-To / References; join the ticket of the one stored last.
  // Order by our own id, not receivedAt, which the sender can set.
  const threadIds = [...new Set([inReplyTo, ...(references ?? [])].filter((id) => id !== undefined))];
  if (threadIds.length === 0) return null;
  return tx.ticketMessage.findFirst({
    where: { messageId: { in: threadIds } },
    orderBy: { id: "desc" },
    select: { ticketId: true },
  });
}
