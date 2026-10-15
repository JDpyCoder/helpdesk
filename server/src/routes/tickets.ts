import {
  createReplySchema,
  listTicketsQuerySchema,
  polishReplySchema,
  ticketIdSchema,
  UNCLASSIFIED,
  updateTicketSchema,
} from "core";
import { type Response, Router } from "express";
import { prisma } from "../db.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { Role, SenderType, TicketStatus } from "../generated/prisma/enums.ts";
import { humanUserWhere } from "../lib/ai-agent.ts";
import { isPolishConfigured, polishReply } from "../lib/polish-reply.ts";
import { isSummaryConfigured, summarizeTicket } from "../lib/summarize-ticket.ts";
import { sendValidationError } from "../lib/validation.ts";
import { type AuthLocals, requireAuth } from "../middleware/requireAuth.ts";

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
    // A ticket the AI is answering (PROCESSING) appears once it is RESOLVED or handed over as OPEN
    status: { equals: status, not: TicketStatus.PROCESSING },
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

// The detail view: list columns plus the whole conversation, oldest message first
const ticketDetailSelect = {
  ...ticketListSelect,
  messages: {
    select: {
      id: true,
      senderType: true,
      author: { select: { id: true, name: true } },
      fromEmail: true,
      fromName: true,
      body: true,
      receivedAt: true,
    },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
  },
} as const satisfies Prisma.TicketSelect;

ticketsRouter.get("/:id", async (req, res) => {
  const parsed = ticketIdSchema.safeParse(req.params.id);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: parsed.data }, select: ticketDetailSelect });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  res.json({ ticket });
});

// Changes status, category and/or assignee; omitted fields are left as they are, null clears.
// The assignee must be an active agent. Returns the updated ticket in the detail shape.
const resolvedStatuses: TicketStatus[] = [TicketStatus.RESOLVED, TicketStatus.CLOSED];

// resolvedAt for a status change: stamped when a ticket becomes RESOLVED/CLOSED from an unresolved status,
// kept between RESOLVED and CLOSED, cleared when it reopens. undefined leaves it unchanged.
function resolvedAtChange(from: TicketStatus, to: TicketStatus | undefined): Date | null | undefined {
  if (to === undefined || to === from) return undefined;
  if (!resolvedStatuses.includes(to)) return null;
  return resolvedStatuses.includes(from) ? undefined : new Date();
}

ticketsRouter.patch("/:id", async (req, res) => {
  const parsedId = ticketIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    sendValidationError(res, parsedId.error);
    return;
  }
  const parsed = updateTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const id = parsedId.data;
  const { status, category, assignedToId } = parsed.data;

  const current = await prisma.ticket.findUnique({ where: { id }, select: { status: true } });
  if (!current) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  if (assignedToId != null) {
    // The AI Agent only gets tickets through auto-resolution
    const assignee = await prisma.user.findFirst({
      where: { id: assignedToId, role: Role.AGENT, deletedAt: null, ...humanUserWhere },
      select: { id: true },
    });
    if (!assignee) {
      const error = "Tickets can only be assigned to an active agent";
      res.status(400).json({ error, fieldErrors: { assignedToId: [error] } });
      return;
    }
  }

  const ticket = await prisma.ticket.update({
    where: { id },
    data: { status, category, assignedToId, resolvedAt: resolvedAtChange(current.status, status) },
    select: ticketDetailSelect,
  });
  res.json({ ticket });
});

// An agent's reply to the customer: appended to the conversation as an AGENT message written by the
// signed-in user. No email is sent yet. Returns the updated ticket in the detail shape.
ticketsRouter.post("/:id/replies", async (req, res: Response<unknown, AuthLocals>) => {
  const parsedId = ticketIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    sendValidationError(res, parsedId.error);
    return;
  }
  const parsed = createReplySchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const id = parsedId.data;
  const { user } = res.locals;

  if (!(await prisma.ticket.findUnique({ where: { id }, select: { id: true } }))) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const ticket = await prisma.ticket.update({
    where: { id },
    data: {
      // Set explicitly: the only other change is the nested message
      updatedAt: new Date(),
      messages: {
        create: {
          senderType: SenderType.AGENT,
          authorId: user.id,
          fromEmail: user.email,
          fromName: user.name,
          body: parsed.data.body,
        },
      },
    },
    select: ticketDetailSelect,
  });
  res.status(201).json({ ticket });
});

// Improves a reply draft with Gemini (greeting the customer, signed by the signed-in agent) and returns { body };
// nothing is saved, the agent still sends it
ticketsRouter.post("/:id/replies/polish", async (req, res: Response<unknown, AuthLocals>) => {
  const parsedId = ticketIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    sendValidationError(res, parsedId.error);
    return;
  }
  const parsed = polishReplySchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  if (!isPolishConfigured()) {
    res.status(503).json({ error: "Reply polishing is not configured" });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: parsedId.data },
    select: {
      subject: true,
      fromName: true,
      messages: {
        select: { senderType: true, fromName: true, body: true },
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  let body: string;
  try {
    body = await polishReply(parsed.data.body, {
      subject: ticket.subject,
      customerName: ticket.fromName,
      agentName: res.locals.user.name,
      messages: ticket.messages,
    });
  } catch (err) {
    console.error("Polishing a reply failed:", err);
    res.status(502).json({ error: "The AI service could not polish the reply. Try again." });
    return;
  }
  res.json({ body });
});

// Summarizes the ticket and its whole conversation with Gemini and returns { summary }. Nothing is
// stored: every call generates a fresh summary, so it always reflects the latest messages.
ticketsRouter.post("/:id/summary", async (req, res) => {
  const parsedId = ticketIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    sendValidationError(res, parsedId.error);
    return;
  }
  if (!isSummaryConfigured()) {
    res.status(503).json({ error: "Ticket summaries are not configured" });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: parsedId.data },
    select: {
      subject: true,
      fromName: true,
      messages: {
        select: { senderType: true, fromName: true, body: true, receivedAt: true },
        orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  let summary: string;
  try {
    summary = await summarizeTicket({ subject: ticket.subject, customerName: ticket.fromName, messages: ticket.messages });
  } catch (err) {
    console.error("Summarizing a ticket failed:", err);
    res.status(502).json({ error: "The AI service could not summarize the ticket. Try again." });
    return;
  }
  res.json({ summary });
});
