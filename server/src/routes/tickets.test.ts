import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Role, SenderType } from "../generated/prisma/enums.ts";

// Unit tests for PATCH /api/tickets/:id assignee validation and POST /api/tickets/:id/replies.
// Prisma and the session check are mocked, so no database or Better Auth instance is needed.
const findTicket = mock();
const findUser = mock();
const updateTicket = mock();
const sessionUser = { id: "agent-1", name: "Alan Agent", email: "alan@example.com" };

mock.module("../db.ts", () => ({
  prisma: {
    ticket: { findUnique: findTicket, update: updateTicket },
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
});

afterEach(() => {
  findTicket.mockReset();
  findUser.mockReset();
  updateTicket.mockReset();
  polishReply.mockReset();
  isPolishConfigured.mockReset();
  isPolishConfigured.mockImplementation(() => true);
});

function patch(id: string | number, body: unknown) {
  return fetch(`${baseUrl}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/tickets/:id assignee", () => {
  it("assigns the ticket to an active agent", async () => {
    findTicket.mockResolvedValue({ id: 1 });
    findUser.mockResolvedValue({ id: "agent-1" });
    updateTicket.mockResolvedValue(updatedTicket);

    const res = await patch(1, { assignedToId: "agent-1" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ticket: updatedTicket });
    expect(findUser).toHaveBeenCalledWith({
      where: { id: "agent-1", role: Role.AGENT, deletedAt: null },
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
