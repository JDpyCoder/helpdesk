import { afterEach, describe, expect, it, mock } from "bun:test";
import { SenderType, TicketStatus } from "../generated/prisma/enums.ts";

// No database: ingestEmail gets a fake transaction client, and the AI Agent lookup is mocked
const getAiAgentId = mock(async () => "ai-agent" as string | null);
mock.module("./ai-agent.ts", () => ({ getAiAgentId }));

const { ingestEmail } = await import("./ingest-email.ts");

const tx = {
  ticket: { findUnique: mock(), update: mock(), updateMany: mock(), create: mock() },
  ticketMessage: { findFirst: mock() },
};

afterEach(() => {
  for (const model of Object.values(tx)) for (const fn of Object.values(model)) fn.mockReset();
});

const email = {
  from: { email: "carla@example.com", name: "Carla Customer" },
  subject: "Refund",
  text: "Can I get a refund?",
};
const agentmail = { threadId: "thr_1", messageId: "<abc@agentmail.to>" };

function ingest(input: Parameters<typeof ingestEmail>[1], ids?: typeof agentmail) {
  return ingestEmail(tx as never, input, ids);
}

describe("ingestEmail from AgentMail", () => {
  it("opens an OPEN, unassigned ticket for a new thread (never offered to the AI) and stores the AgentMail ids", async () => {
    tx.ticketMessage.findFirst.mockResolvedValue(null);
    tx.ticket.findUnique.mockResolvedValue(null);
    tx.ticket.create.mockResolvedValue({ id: 5 });

    const result = await ingest({ ...email, messageId: "<abc@agentmail.to>" }, agentmail);

    expect(result).toEqual({ ticketId: 5, created: true, autoResolve: false });
    const { data } = tx.ticket.create.mock.calls[0]?.[0];
    expect(data).toMatchObject({
      agentmailThreadId: "thr_1",
      status: TicketStatus.OPEN,
      assignedToId: null,
      messages: { create: { agentmailMessageId: "<abc@agentmail.to>", senderType: SenderType.CUSTOMER } },
    });
  });

  it("adds a follow-up in the same thread to its ticket and reopens it", async () => {
    tx.ticketMessage.findFirst.mockResolvedValue(null);
    tx.ticket.findUnique.mockResolvedValue({ id: 5 });

    const result = await ingest({ ...email, text: "Any news?" }, { threadId: "thr_1", messageId: "<def@agentmail.to>" });

    expect(result).toEqual({ ticketId: 5, created: false });
    expect(tx.ticket.findUnique).toHaveBeenCalledWith({ where: { agentmailThreadId: "thr_1" }, select: { id: true } });
    expect(tx.ticket.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 5 },
      data: { status: TicketStatus.OPEN, resolvedAt: null, messages: { create: { body: "Any news?" } } },
    });
    // A ticket the AI resolved leaves the AI Agent
    expect(tx.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: 5, assignedToId: "ai-agent" },
      data: { assignedToId: null },
    });
    expect(tx.ticket.create).not.toHaveBeenCalled();
  });

  it("falls back to In-Reply-To when the thread is unknown", async () => {
    tx.ticketMessage.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ ticketId: 9 });
    tx.ticket.findUnique.mockResolvedValue(null);

    const result = await ingest({ ...email, inReplyTo: "<old@example.com>" }, agentmail);

    expect(result).toEqual({ ticketId: 9, created: false });
    expect(tx.ticketMessage.findFirst.mock.calls[1]?.[0].where).toEqual({ messageId: { in: ["<old@example.com>"] } });
  });

  it("acknowledges an email it already stored, by Message-ID or AgentMail id", async () => {
    tx.ticketMessage.findFirst.mockResolvedValue({ ticketId: 5 });

    const result = await ingest({ ...email, messageId: "<abc@agentmail.to>" }, agentmail);

    expect(result).toEqual({ ticketId: 5, created: false, duplicate: true });
    expect(tx.ticketMessage.findFirst.mock.calls[0]?.[0].where).toEqual({
      OR: [{ messageId: "<abc@agentmail.to>" }, { agentmailMessageId: "<abc@agentmail.to>" }],
    });
    expect(tx.ticket.create).not.toHaveBeenCalled();
    expect(tx.ticket.update).not.toHaveBeenCalled();
  });
});
