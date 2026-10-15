import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Role } from "../generated/prisma/enums.ts";

// Unit tests for DELETE /api/users/:id. Prisma, the session check and Better Auth are mocked,
// so no database or auth instance is needed.
const findUser = mock();
const updateUser = mock();
const deleteSessions = mock();
const updateTickets = mock();
const transaction = mock();

mock.module("../db.ts", () => ({
  prisma: {
    user: { findFirst: findUser, update: updateUser },
    session: { deleteMany: deleteSessions },
    ticket: { updateMany: updateTickets },
    $transaction: transaction,
  },
}));
mock.module("../middleware/requireAuth.ts", () => ({
  // Every request comes from the same signed-in admin
  requireAuth: (_req: Request, res: Response, next: NextFunction) => {
    res.locals.user = { id: "admin-1", name: "Ada Admin", role: Role.ADMIN };
    next();
  },
}));
// DELETE doesn't use Better Auth; this keeps the real config (and its env checks) from loading
mock.module("../auth.ts", () => ({ auth: {} }));

// Imported after the mocks, so the router never loads the real Prisma client or auth config
const { usersRouter } = await import("./users.ts");

let server: Server;
let baseUrl: string;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use("/api/users", usersRouter);
  server = app.listen(0);
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}/api/users`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  for (const fn of [findUser, updateUser, deleteSessions, updateTickets, transaction]) fn.mockReset();
});

function del(id: string) {
  return fetch(`${baseUrl}/${id}`, { method: "DELETE" });
}

describe("DELETE /api/users/:id", () => {
  it("soft-deletes the agent, signs them out and unassigns their tickets in one transaction", async () => {
    findUser.mockResolvedValue({ email: "alan@example.com", role: Role.AGENT });
    // The batch transaction receives the pending queries; stand-ins let the test check which ones
    updateUser.mockReturnValue("update-user");
    deleteSessions.mockReturnValue("delete-sessions");
    updateTickets.mockReturnValue("unassign-tickets");
    transaction.mockResolvedValue([]);

    const res = await del("agent-1");

    expect(res.status).toBe(204);
    expect(updateTickets).toHaveBeenCalledWith({ where: { assignedToId: "agent-1" }, data: { assignedToId: null } });
    expect(deleteSessions).toHaveBeenCalledWith({ where: { userId: "agent-1" } });
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "agent-1" },
      data: { deletedAt: expect.any(Date), email: "deleted+agent-1+alan@example.com" },
    });
    expect(transaction).toHaveBeenCalledWith(["update-user", "delete-sessions", "unassign-tickets"]);
  });

  it("unassigns nothing for an admin target (403)", async () => {
    findUser.mockResolvedValue({ email: "ada@example.com", role: Role.ADMIN });

    const res = await del("admin-2");

    expect(res.status).toBe(403);
    expect(updateTickets).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("unassigns nothing for an unknown or already deleted user (404)", async () => {
    findUser.mockResolvedValue(null);

    const res = await del("missing");

    expect(res.status).toBe(404);
    expect(findUser).toHaveBeenCalledWith({
      where: { id: "missing", deletedAt: null },
      select: { email: true, role: true },
    });
    expect(updateTickets).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
