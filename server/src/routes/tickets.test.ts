import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { EmailStatus, Role, SenderType, TicketStatus } from "../generated/prisma/enums.ts";
import { AI_AGENT_EMAIL } from "../lib/ai-agent.ts";

// Unit tests for GET /api/tickets (hiding PROCESSING tickets), PATCH /api/tickets/:id assignee validation, POST /api/tickets/:id/replies (and polish)
// and POST /api/tickets/:id/summary.
// Prisma and the session check are mocked, so no database or Better Auth instance is needed.
const findTicket = mock();
const findUser = mock();
const updateTicket = mock();
const findTickets = mock();
const countTickets = mock();
const findMessage = mock();
const updateMessages = mock();
const sessionUser = { id: "agent-1", name: "Alan Agent", email: "alan@example.com" };

mock.module("../db.ts", () => ({
  prisma: {
    ticket: { findUnique: findTicket, update: updateTicket, findMany: findTickets, count: countTickets },
    ticketMessage: { findFirst: findMessage, updateMany: updateMessages },
    $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    user: { findFirst: findUser },
  },
}));
mock.module("../middleware/requireAuth.ts", () => ({
  // Every request comes from the same signed-in agent
  requireAuth: (_req: Request, res: Response, next: NextFunction) => {
    res.locals.user = sessionUser;
    next();
  },
}));

// Gemini is never called: the route's use of it is checked through these
const isPolishConfigured = mock(() => true);
const polishReply = mock();
mock.module("../lib/polish-reply.ts", () => ({ isPolishConfigured, polishReply }));
const isSummaryConfigured = mock(() => true);
const summarizeTicket = mock();
mock.module("../lib/summarize-ticket.ts", () => ({ isSummaryConfigured, summarizeTicket }));
// AgentMail is never called: the route only decides which replies are emailed. A spy rather than a module mock,
// so agentmail.test.ts still gets the real module whatever order the files run in.
const agentmail = await import("../lib/agentmail.ts");
const sendReplyEmail = spyOn(agentmail, "sendReplyEmail").mockImplementation(async () => {});

// Imported after the mocks, so the router never loads the real Prisma client or auth config
const { ticketsRouter } = await import("./tickets.ts");

const error = "Tickets can only be assigned to an active agent";
const updatedTicket = { id: 1, subject: "Printer on fire", messages: [] };

let server: Server;
let baseUrl: string;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use("/api/tickets", ticketsRouter);
  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}/api/tickets`;
});

afterAll(() => {
  server.close();
  sendReplyEmail.mockRestore();
});

afterEach(() => {
  findTicket.mockReset();
  findUser.mockReset();
  updateTicket.mockReset();
  findTickets.mockReset();
  countTickets.mockReset();
  findMessage.mockReset();
  updateMessages.mockReset();
  sendReplyEmail.mockClear();
  polishReply.mockReset();
  isPolishConfigured.mockReset();
  isPolishConfigured.mockImplementation(() => true);
  summarizeTicket.mockReset();
  isSummaryConfigured.mockReset();
  isSummaryConfigured.mockImplementation(() => true);
});

function patch(id: string | number, body: unknown) {
  return fetch(`${baseUrl}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/tickets", () => {
  it("leaves out PROCESSING tickets (the AI is answering them), in the page and the total", async () => {
    findTickets.mockResolvedValue([]);
    countTickets.mockResolvedValue(0);

    const res = await fetch(`${baseUrl}?status=OPEN&search=refund`);

    expect(res.status).toBe(200);
    const [findArgs] = findTickets.mock.calls[0]!;
    expect(findArgs.where).toMatchObject({ status: { equals: "OPEN", not: "PROCESSING" } });
    expect(countTickets).toHaveBeenCalledWith({ where: findArgs.where });
  });

  it("returns each ticket's latest senders oldest first, without the messages", async () => {
    // Loaded newest first, as the query asks for the latest messages
    findTickets.mockResolvedValue([
      { id: 7, subject: "Refund", messages: [{ senderType: "AGENT" }, { senderType: "AI" }, { senderType: "CUSTOMER" }] },
    ]);
    countTickets.mockResolvedValue(1);

    const res = await fetch(baseUrl);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tickets: [{ id: 7, subject: "Refund", conversation: ["CUSTOMER", "AI", "AGENT"] }],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    const [findArgs] = findTickets.mock.calls[0]!;
    expect(findArgs.select.messages).toMatchObject({ select: { senderType: true }, take: 8 });
  });
});

describe("PATCH /api/tickets/:id assignee", () => {
  it("assigns the ticket to an active agent", async () => {
    findTicket.mockResolvedValue({ id: 1 });
    findUser.mockResolvedValue({ id: "agent-1" });
    updateTicket.mockResolvedValue(updatedTicket);

    const res = await patch(1, { assignedToId: "agent-1" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ticket: updatedTicket });
    expect(findUser).toHaveBeenCalledWith({
      where: { id: "agent-1", role: Role.AGENT, deletedAt: null, email: { not: AI_AGENT_EMAIL } },
      select: { id: true },
    });
    expect(updateTicket).toHaveBeenCalledTimes(1);
    expect(updateTicket.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 1 },
      data: { assignedToId: "agent-1" },
    });
  });

  // The lookup filters on role and deletedAt, so an unknown id, an admin and a soft-deleted
  // agent all come back empty and get the same answer
  it("refuses an id that is not an active agent and leaves the ticket unchanged", async () => {
    findTicket.mockResolvedValue({ id: 1 });
    findUser.mockResolvedValue(null);

    const res = await patch(1, { assignedToId: "no-such-user" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error, fieldErrors: { assignedToId: [error] } });
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it("unassigns with null without looking up a user", async () => {
    findTicket.mockResolvedValue({ id: 1 });
    updateTicket.mockResolvedValue(updatedTicket);

    const res = await patch(1, { assignedToId: null });

    expect(res.status).toBe(200);
    expect(findUser).not.toHaveBeenCalled();
    expect(updateTicket.mock.calls[0]?.[0]).toMatchObject({ data: { assignedToId: null } });
  });

  it("leaves the assignee alone when assignedToId is omitted", async () => {
    findTicket.mockResolvedValue({ id: 1 });
    updateTicket.mockResolvedValue(updatedTicket);

    const res = await patch(1, { status: "RESOLVED" });

    expect(res.status).toBe(200);
    expect(findUser).not.toHaveBeenCalled();
    expect(updateTicket.mock.calls[0]?.[0].data.assignedToId).toBeUndefined();
  });

  it.each([
    ["an empty string", ""],
    ["a number", 42],
    ["an object", { id: "agent-1" }],
  ])("rejects %s before touching the database", async (_label, assignedToId) => {
    const res = await patch(1, { assignedToId });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string[]> };
    expect(body.fieldErrors.assignedToId).toHaveLength(1);
    expect(findTicket).not.toHaveBeenCalled();
    expect(findUser).not.toHaveBeenCalled();
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown ticket without checking the assignee", async () => {
    findTicket.mockResolvedValue(null);

    const res = await patch(999, { assignedToId: "agent-1" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Ticket not found" });
    expect(findUser).not.toHaveBeenCalled();
    expect(updateTicket).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tickets/:id resolvedAt", () => {
  async function resolvedAtAfter(from: TicketStatus, body: Record<string, unknown>) {
    findTicket.mockResolvedValue({ status: from });
    updateTicket.mockResolvedValue(updatedTicket);
    const res = await patch(1, body);
    expect(res.status).toBe(200);
    return updateTicket.mock.calls[0]?.[0].data.resolvedAt;
  }

  it.each([TicketStatus.RESOLVED, TicketStatus.CLOSED])("stamps it when an open ticket becomes %s", async (to) => {
    expect(await resolvedAtAfter(TicketStatus.OPEN, { status: to })).toBeInstanceOf(Date);
  });

  it("keeps it between RESOLVED and CLOSED", async () => {
    expect(await resolvedAtAfter(TicketStatus.RESOLVED, { status: TicketStatus.CLOSED })).toBeUndefined();
  });

  it("clears it when the ticket reopens", async () => {
    expect(await resolvedAtAfter(TicketStatus.CLOSED, { status: TicketStatus.OPEN })).toBeNull();
  });

  it("leaves it alone when the status is unchanged or not sent", async () => {
    expect(await resolvedAtAfter(TicketStatus.RESOLVED, { status: TicketStatus.RESOLVED })).toBeUndefined();
    updateTicket.mockReset();
    expect(await resolvedAtAfter(TicketStatus.RESOLVED, { category: null })).toBeUndefined();
  });
});

function postReply(id: string | number, body: unknown) {
  return fetch(`${baseUrl}/${id}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tickets/:id/replies", () => {
  it("adds an AGENT message written by the signed-in user and returns the ticket", async () => {
    findTicket.mockResolvedValue({ id: 1 });
    updateTicket.mockResolvedValue(updatedTicket);

    const res = await postReply(1, { body: "  Thanks, we're on it.  " });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ticket: updatedTicket });
    expect(updateTicket).toHaveBeenCalledTimes(1);
    const args = updateTicket.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      where: { id: 1 },
      data: {
        messages: {
          create: {
            senderType: SenderType.AGENT,
            authorId: "agent-1",
            fromEmail: "alan@example.com",
            fromName: "Alan Agent",
            body: "Thanks, we're on it.",
          },
        },
      },
    });
    expect(args.data.updatedAt).toBeInstanceOf(Date);
    // Replying doesn't change the ticket's status
    expect(args.data.status).toBeUndefined();
  });

  it("never emails a reply to a ticket that didn't come from AgentMail", async () => {
    findTicket.mockResolvedValue({ agentmailThreadId: null });
    updateTicket.mockResolvedValue(updatedTicket);

    const res = await postReply(1, { body: "Thanks, we're on it." });

    expect(res.status).toBe(201);
    expect(updateTicket.mock.calls[0]?.[0].data.messages.create.emailStatus).toBeNull();
    expect(sendReplyEmail).not.toHaveBeenCalled();
  });

  it("stores a reply to an AgentMail ticket as PENDING, emails it and returns the ticket after sending", async () => {
    const reply = { id: 7, author: { id: "agent-1", name: "Alan Agent" }, emailStatus: EmailStatus.PENDING };
    const sentTicket = { ...updatedTicket, messages: [{ ...reply, emailStatus: EmailStatus.SENT }] };
    findTicket.mockResolvedValueOnce({ agentmailThreadId: "thread-1" }).mockResolvedValueOnce(sentTicket);
    updateTicket.mockResolvedValue({ ...updatedTicket, messages: [reply] });

    const res = await postReply(1, { body: "Thanks, we're on it." });

    expect(res.status).toBe(201);
    expect(updateTicket.mock.calls[0]?.[0].data.messages.create.emailStatus).toBe(EmailStatus.PENDING);
    expect(sendReplyEmail).toHaveBeenCalledWith(7);
    expect(await res.json()).toEqual({ ticket: sentTicket });
  });

  it.each([
    ["a blank body", { body: "   " }],
    ["a body under 5 characters after trimming", { body: "  Okay  " }],
    ["a missing body", {}],
    ["a body over 10,000 characters", { body: "x".repeat(10001) }],
  ])("rejects %s before touching the database", async (_label, body) => {
    const res = await postReply(1, body);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { fieldErrors: Record<string, string[]> };
    expect(json.fieldErrors.body).toHaveLength(1);
    expect(findTicket).not.toHaveBeenCalled();
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it("rejects a malformed ticket id", async () => {
    const res = await postReply("abc", { body: "Hello" });

    expect(res.status).toBe(400);
    expect(findTicket).not.toHaveBeenCalled();
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown ticket", async () => {
    findTicket.mockResolvedValue(null);

    const res = await postReply(999, { body: "Hello" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Ticket not found" });
    expect(updateTicket).not.toHaveBeenCalled();
  });
});

function resend(id: string | number, messageId: string | number) {
  return fetch(`${baseUrl}/${id}/messages/${messageId}/resend`, { method: "POST" });
}

describe("POST /api/tickets/:id/messages/:messageId/resend", () => {
  it("sets a FAILED reply back to PENDING, sends it again and returns the ticket", async () => {
    findMessage.mockResolvedValue({ emailStatus: EmailStatus.FAILED });
    updateMessages.mockResolvedValue({ count: 1 });
    findTicket.mockResolvedValue(updatedTicket);

    const res = await resend(1, 7);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ticket: updatedTicket });
    expect(findMessage.mock.calls[0]?.[0].where).toEqual({ id: 7, ticketId: 1 });
    expect(updateMessages).toHaveBeenCalledWith({
      where: { id: 7, emailStatus: EmailStatus.FAILED },
      data: { emailStatus: EmailStatus.PENDING, emailError: null },
    });
    expect(sendReplyEmail).toHaveBeenCalledWith(7);
  });

  it("refuses a reply whose email didn't fail (or a second click), without sending", async () => {
    findMessage.mockResolvedValue({ emailStatus: EmailStatus.SENT });
    updateMessages.mockResolvedValue({ count: 0 });

    const res = await resend(1, 7);

    expect(res.status).toBe(409);
    expect(sendReplyEmail).not.toHaveBeenCalled();
  });

  it("returns 404 for a message that isn't on the ticket", async () => {
    findMessage.mockResolvedValue(null);

    const res = await resend(1, 7);

    expect(res.status).toBe(404);
    expect(updateMessages).not.toHaveBeenCalled();
    expect(sendReplyEmail).not.toHaveBeenCalled();
  });

  it("rejects a malformed message id", async () => {
    const res = await resend(1, "abc");

    expect(res.status).toBe(400);
    expect(findMessage).not.toHaveBeenCalled();
  });
});

function postPolish(id: string | number, body: unknown) {
  return fetch(`${baseUrl}/${id}/replies/polish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tickets/:id/replies/polish", () => {
  const ticketForPolish = {
    subject: "Refund for my course",
    fromName: "Carla Customer",
    messages: [{ senderType: SenderType.CUSTOMER, fromName: "Carla Customer", body: "Can I get a refund?" }],
  };

  it("polishes the trimmed draft with the ticket as context and returns it without saving", async () => {
    findTicket.mockResolvedValue(ticketForPolish);
    polishReply.mockResolvedValue("Hi Carla, we have refunded your order.");

    const res = await postPolish(42, { body: "  hi carla we refunded ur order  " });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ body: "Hi Carla, we have refunded your order." });
    expect(findTicket).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42 } }));
    expect(polishReply).toHaveBeenCalledWith("hi carla we refunded ur order", {
      subject: "Refund for my course",
      customerName: "Carla Customer",
      agentName: "Alan Agent",
      messages: ticketForPolish.messages,
    });
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it("rejects a blank draft with 400 before looking up the ticket", async () => {
    const res = await postPolish(42, { body: "   " });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Reply must be at least 5 characters" });
    expect(findTicket).not.toHaveBeenCalled();
    expect(polishReply).not.toHaveBeenCalled();
  });

  it("rejects a malformed ticket id with 400", async () => {
    const res = await postPolish("abc", { body: "hello" });

    expect(res.status).toBe(400);
    expect(polishReply).not.toHaveBeenCalled();
  });

  it("answers 503 when no Gemini API key is set", async () => {
    isPolishConfigured.mockImplementation(() => false);

    const res = await postPolish(42, { body: "hello" });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Reply polishing is not configured" });
    expect(findTicket).not.toHaveBeenCalled();
    expect(polishReply).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown ticket", async () => {
    findTicket.mockResolvedValue(null);

    const res = await postPolish(42, { body: "hello" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Ticket not found" });
    expect(polishReply).not.toHaveBeenCalled();
  });

  it("answers 502 when Gemini fails", async () => {
    findTicket.mockResolvedValue(ticketForPolish);
    polishReply.mockRejectedValue(new Error("quota exceeded"));
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    const res = await postPolish(42, { body: "hello" });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "The AI service could not polish the reply. Try again." });
    consoleError.mockRestore();
  });
});

function postSummary(id: string | number) {
  return fetch(`${baseUrl}/${id}/summary`, { method: "POST" });
}

describe("POST /api/tickets/:id/summary", () => {
  const ticketForSummary = {
    subject: "Refund for my course",
    fromName: "Carla Customer",
    messages: [
      {
        senderType: SenderType.CUSTOMER,
        fromName: "Carla Customer",
        body: "Can I get a refund?",
        receivedAt: new Date("2026-10-02T09:30:00.000Z"),
      },
    ],
  };

  it("summarizes the ticket with its whole conversation and returns it without saving", async () => {
    findTicket.mockResolvedValue(ticketForSummary);
    summarizeTicket.mockResolvedValue("Carla wants a refund for her course.");

    const res = await postSummary(42);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: "Carla wants a refund for her course." });
    expect(findTicket).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 42 } }));
    expect(summarizeTicket).toHaveBeenCalledWith({
      subject: "Refund for my course",
      customerName: "Carla Customer",
      messages: ticketForSummary.messages,
    });
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it("generates a new summary on every request", async () => {
    findTicket.mockResolvedValue(ticketForSummary);
    summarizeTicket.mockResolvedValueOnce("First summary.").mockResolvedValueOnce("Second summary.");

    expect(await (await postSummary(42)).json()).toEqual({ summary: "First summary." });
    expect(await (await postSummary(42)).json()).toEqual({ summary: "Second summary." });
    expect(summarizeTicket).toHaveBeenCalledTimes(2);
  });

  it("rejects a malformed ticket id with 400", async () => {
    const res = await postSummary("abc");

    expect(res.status).toBe(400);
    expect(findTicket).not.toHaveBeenCalled();
    expect(summarizeTicket).not.toHaveBeenCalled();
  });

  it("answers 503 when no Gemini API key is set", async () => {
    isSummaryConfigured.mockImplementation(() => false);

    const res = await postSummary(42);

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Ticket summaries are not configured" });
    expect(findTicket).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown ticket", async () => {
    findTicket.mockResolvedValue(null);

    const res = await postSummary(42);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Ticket not found" });
    expect(summarizeTicket).not.toHaveBeenCalled();
  });

  it("answers 502 when Gemini fails", async () => {
    findTicket.mockResolvedValue(ticketForSummary);
    summarizeTicket.mockRejectedValue(new Error("quota exceeded"));
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    const res = await postSummary(42);

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "The AI service could not summarize the ticket. Try again." });
    consoleError.mockRestore();
  });
});
