import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Role } from "../generated/prisma/enums.ts";

// Unit tests for PATCH /api/tickets/:id assignee validation. Prisma and the session check are
// mocked, so no database or Better Auth instance is needed.
const findTicket = mock();
const findUser = mock();
const updateTicket = mock();

mock.module("../db.ts", () => ({
  prisma: {
    ticket: { findUnique: findTicket, update: updateTicket },
    user: { findFirst: findUser },
  },
}));
mock.module("../middleware/requireAuth.ts", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

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
