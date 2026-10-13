import { listTicketsQuerySchema, UNCLASSIFIED } from "core";
import { Router } from "express";
import { prisma } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
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

// Case-insensitive match on subject, sender name or email, plus the ticket id for "42" / "#42"
function searchWhere(search: string): Prisma.TicketWhereInput {
  const contains = { contains: search, mode: "insensitive" } as const;
  const idMatch = /^#?(\d{1,9})$/.exec(search);
  return {
    OR: [
      { subject: contains },
      { fromName: contains },
      { fromEmail: contains },
      ...(idMatch ? [{ id: Number(idMatch[1]) }] : []),
    ],
  };
}

// Newest first by default; ?status=, ?category= (or "none" for unclassified), ?search=, ?sortBy=, ?order=,
// ?page= and ?pageSize= are optional. Returns one page plus `total`, the count of matching tickets.
ticketsRouter.get("/", async (req, res) => {
  const parsed = listTicketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const { status, category, search, sortBy, order, page, pageSize } = parsed.data;

  const where: Prisma.TicketWhereInput = {
    status,
    category: category === UNCLASSIFIED ? null : category,
    ...(search && searchWhere(search)),
  };
  // assignedTo sorts by the assignee's name. Enums (status, category) sort in their schema.prisma
  // declaration order, and nulls (unassigned, unclassified) follow Postgres: last asc, first desc.
  const primary = sortBy === "assignedTo" ? { assignedTo: { name: order } } : { [sortBy]: order };

  // The page and the total, in one round trip
  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      select: ticketListSelect,
      // id breaks ties so tickets with the same value keep a stable order, which paging relies on
      orderBy: sortBy === "id" ? [primary] : [primary, { id: order }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);
  res.json({ tickets, total, page, pageSize });
});
