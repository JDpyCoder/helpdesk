import { type DashboardStats, TICKETS_PER_DAY_DAYS, type TicketsPerDay, ticketsPerDayQuerySchema } from "core";
import { Router } from "express";
import { prisma } from "../db.ts";
import { AI_AGENT_EMAIL } from "../lib/ai-agent.ts";
import { sendValidationError } from "../lib/validation.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

// Ticket overview for the dashboard: mounted at /api/dashboard, for any signed-in agent or admin
export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

// A row of the dashboard_stats() SQL function (migration 20261016040000_dashboard_stats_function)
type DashboardStatsRow = {
  total_tickets: number;
  open_tickets: number;
  ai_resolved_tickets: number;
  ai_resolved_percent: number;
  avg_resolution_seconds: number | null;
};

// Computed by the database in one pass over the tickets, rounding included; this only renames the columns
dashboardRouter.get("/stats", async (_req, res) => {
  const [row] = await prisma.$queryRaw<DashboardStatsRow[]>`SELECT * FROM dashboard_stats(${AI_AGENT_EMAIL})`;
  if (!row) throw new Error("dashboard_stats() returned no row");

  const stats: DashboardStats = {
    totalTickets: row.total_tickets,
    openTickets: row.open_tickets,
    aiResolvedTickets: row.ai_resolved_tickets,
    aiResolvedPercent: row.ai_resolved_percent,
    avgResolutionSeconds: row.avg_resolution_seconds,
  };
  res.json(stats);
});

// Tickets created per calendar day (in the caller's time zone) over the last TICKETS_PER_DAY_DAYS days, today
// included. generate_series supplies every day, so days without tickets come back with a count of 0.
dashboardRouter.get("/tickets-per-day", async (req, res) => {
  const parsed = ticketsPerDayQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const { timeZone } = parsed.data;

  // createdAt is a UTC timestamp without a zone: read it as UTC, then convert to the caller's local time
  const days = await prisma.$queryRaw<TicketsPerDay["days"]>`
    WITH days AS (
      SELECT generate_series(
        (now() AT TIME ZONE ${timeZone})::date - ${TICKETS_PER_DAY_DAYS - 1}::int,
        (now() AT TIME ZONE ${timeZone})::date,
        interval '1 day'
      )::date AS day
    )
    SELECT to_char(days.day, 'YYYY-MM-DD') AS date, COUNT(t.id)::int AS count
    FROM days
    LEFT JOIN "ticket" t ON (t."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone})::date = days.day
    GROUP BY days.day
    ORDER BY days.day`;

  const body: TicketsPerDay = { days };
  res.json(body);
});
