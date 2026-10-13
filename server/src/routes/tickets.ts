import { listTicketsQuerySchema } from "core";
import { Router } from "express";
import { prisma } from "../db.ts";
import { sendValidationError } from "../lib/validation.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

// Ticket management: mounted at /api/tickets, for any signed-in agent or admin
export const ticketsRouter = Router();

ticketsRouter.use(requireAuth);

// List columns only; message bodies are loaded by the detail view
const ticketListSelect = {
  id: true,
  subject: true,
  fromEmail: true,
  fromName: true,
  status: true,
  category: true,
  assignedTo: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

// Newest first by default; ?status=, ?category=, ?sortBy= and ?order= are optional
ticketsRouter.get("/", async (req, res) => {
  const parsed = listTicketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const { status, category, sortBy, order } = parsed.data;

  // assignedTo sorts by the assignee's name. Enums (status, category) sort in their schema.prisma
  // declaration order, and nulls (unassigned, unclassified) follow Postgres: last asc, first desc.
  const primary = sortBy === "assignedTo" ? { assignedTo: { name: order } } : { [sortBy]: order };

  const tickets = await prisma.ticket.findMany({
    where: { status, category },
    select: ticketListSelect,
    // id breaks ties so tickets with the same value keep a stable order
    orderBy: sortBy === "id" ? [primary] : [primary, { id: order }],
  });
  res.json({ tickets });
});
