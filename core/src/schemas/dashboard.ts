import { z } from "zod";

// GET /api/dashboard/stats response
export type DashboardStats = {
  // Every ticket, in any status
  totalTickets: number;
  // Tickets with status OPEN
  openTickets: number;
  // RESOLVED or CLOSED tickets still assigned to the AI Agent
  aiResolvedTickets: number;
  // aiResolvedTickets as a share of totalTickets, 0–100 with one decimal; 0 when there are no tickets
  aiResolvedPercent: number;
  // Mean time from creation to resolvedAt over resolved/closed tickets; null when there are none
  avgResolutionSeconds: number | null;
};

// How many days GET /api/dashboard/tickets-per-day covers, today included
export const TICKETS_PER_DAY_DAYS = 30;

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// GET /api/dashboard/tickets-per-day query: the IANA time zone whose calendar days tickets are counted in
export const ticketsPerDayQuerySchema = z.object({
  timeZone: z.string().trim().max(100).refine(isTimeZone, "Unknown time zone").default("UTC"),
});

export type TicketsPerDayQuery = z.infer<typeof ticketsPerDayQuerySchema>;

// GET /api/dashboard/tickets-per-day response: one entry per day, oldest first, days without tickets included
export type TicketsPerDay = {
  days: { date: string; count: number }[];
};
