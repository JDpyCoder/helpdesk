import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { AI_AGENT_EMAIL } from "../lib/ai-agent.ts";

// Unit tests for the /api/dashboard routes. Prisma and the session check are mocked, so the SQL itself
// (the dashboard_stats() function and the per-day query) is checked against a real database, not here.
const queryRaw = mock();

mock.module("../db.ts", () => ({
  prisma: { $queryRaw: queryRaw },
}));
mock.module("../middleware/requireAuth.ts", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

const { dashboardRouter } = await import("./dashboard.ts");

let server: Server;
let url: string;

beforeAll(() => {
  const app = express();
  app.use("/api/dashboard", dashboardRouter);
  server = app.listen(0);
  url = `http://localhost:${(server.address() as AddressInfo).port}/api/dashboard/stats`;
});

afterAll(() => {
  server.close();
});

afterEach(() => {
  queryRaw.mockReset();
});

// $queryRaw is a tagged template: the call gets the SQL fragments, then the interpolated values
function sentQuery() {
  const [strings, ...values] = queryRaw.mock.calls[0] ?? [];
  return { sql: (strings as string[]).join("?"), values };
}

describe("GET /api/dashboard/stats", () => {
  it("returns the row computed by dashboard_stats() for the AI Agent", async () => {
    queryRaw.mockResolvedValue([
      {
        total_tickets: 3,
        open_tickets: 1,
        ai_resolved_tickets: 1,
        ai_resolved_percent: 33.3,
        avg_resolution_seconds: 5400,
      },
    ]);

    const res = await fetch(url);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      totalTickets: 3,
      openTickets: 1,
      aiResolvedTickets: 1,
      aiResolvedPercent: 33.3,
      avgResolutionSeconds: 5400,
    });
    expect(sentQuery()).toEqual({ sql: "SELECT * FROM dashboard_stats(?)", values: [AI_AGENT_EMAIL] });
  });

  it("passes on a null average", async () => {
    queryRaw.mockResolvedValue([
      { total_tickets: 0, open_tickets: 0, ai_resolved_tickets: 0, ai_resolved_percent: 0, avg_resolution_seconds: null },
    ]);

    expect(await (await fetch(url)).json()).toMatchObject({ totalTickets: 0, avgResolutionSeconds: null });
  });
});

describe("GET /api/dashboard/tickets-per-day", () => {
  const perDayUrl = () => url.replace(/stats$/, "tickets-per-day");
  const days = [
    { date: "2026-10-15", count: 0 },
    { date: "2026-10-16", count: 4 },
  ];

  it("counts tickets per day in the caller's time zone", async () => {
    queryRaw.mockResolvedValue(days);

    const res = await fetch(`${perDayUrl()}?timeZone=Asia/Kolkata`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ days });
    expect(sentQuery().values).toEqual(["Asia/Kolkata", 29, "Asia/Kolkata", "Asia/Kolkata"]);
  });

  it("uses UTC when no time zone is given", async () => {
    queryRaw.mockResolvedValue(days);

    await fetch(perDayUrl());

    expect(sentQuery().values[0]).toBe("UTC");
  });

  it("rejects an unknown time zone without querying", async () => {
    const res = await fetch(`${perDayUrl()}?timeZone=Mars/Olympus_Mons`);

    expect(res.status).toBe(400);
    expect(((await res.json()) as { fieldErrors: Record<string, string[]> }).fieldErrors.timeZone).toEqual([
      "Unknown time zone",
    ]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
