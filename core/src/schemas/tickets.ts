import { z } from "zod";

// Must match the TicketStatus / TicketCategory enums in server/prisma/schema.prisma.
// Each name is both the value (TicketStatus.OPEN) and the type.
export const ticketStatusSchema = z.enum(["OPEN", "RESOLVED", "CLOSED"]);
export const TicketStatus = ticketStatusSchema.enum;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketCategorySchema = z.enum(["GENERAL_QUESTION", "TECHNICAL_QUESTION", "REFUND_REQUEST"]);
export const TicketCategory = ticketCategorySchema.enum;
export type TicketCategory = z.infer<typeof ticketCategorySchema>;

// Must match the SenderType enum in server/prisma/schema.prisma: who wrote a ticket message,
// the customer (inbound email) or an agent (a reply from the app)
export const senderTypeSchema = z.enum(["CUSTOMER", "AGENT"]);
export const SenderType = senderTypeSchema.enum;
export type SenderType = z.infer<typeof senderTypeSchema>;

// Columns GET /api/tickets can sort by; the client's table uses the same names as column ids.
// assignedTo sorts by the assignee's name.
export const ticketSortFieldSchema = z.enum([
  "id",
  "subject",
  "fromName",
  "status",
  "category",
  "assignedTo",
  "createdAt",
  "updatedAt",
]);
export type TicketSortField = z.infer<typeof ticketSortFieldSchema>;

export const sortOrderSchema = z.enum(["asc", "desc"]);
export type SortOrder = z.infer<typeof sortOrderSchema>;

// ?category= also accepts "none" for tickets that have no category yet (unclassified)
export const UNCLASSIFIED = "none";
export const ticketCategoryFilterSchema = z.union([ticketCategorySchema, z.literal(UNCLASSIFIED)]);
export type TicketCategoryFilter = z.infer<typeof ticketCategoryFilterSchema>;

// Page sizes the ticket list offers; the API rejects any other
export const TICKET_PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_TICKET_PAGE_SIZE = 10;

// GET /api/tickets query string: optional filters, sorting (newest first by default) and pagination
export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  category: ticketCategoryFilterSchema.optional(),
  // Free text matched against subject, sender name and email; "42" or "#42" also matches ticket #42.
  // Blank means no search.
  search: z.string().trim().max(200, "Search must be at most 200 characters").optional(),
  sortBy: ticketSortFieldSchema.default("createdAt"),
  order: sortOrderSchema.default("desc"),
  // 1-based; a page past the end returns no tickets (with the real total)
  page: z.coerce.number().int().min(1, "Page must be at least 1").default(1),
  pageSize: z.coerce
    .number()
    .int()
    .refine((size) => (TICKET_PAGE_SIZES as readonly number[]).includes(size), {
      message: `Page size must be one of ${TICKET_PAGE_SIZES.join(", ")}`,
    })
    .default(DEFAULT_TICKET_PAGE_SIZE),
});

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

// PATCH /api/tickets/:id body. Omitted fields are left unchanged; null clears category or assignee.
export const updateTicketSchema = z
  .object({
    status: ticketStatusSchema.optional(),
    category: ticketCategorySchema.nullable().optional(),
    assignedToId: z.string().min(1).nullable().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nothing to update",
  });

export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

// POST /api/tickets/:id/replies body: an agent's reply to the customer
export const createReplySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Reply cannot be empty")
    .max(10000, "Reply must be at most 10,000 characters"),
});

export type CreateReplyInput = z.infer<typeof createReplySchema>;

// :id in /api/tickets/:id (and the client's /tickets/:id route): a positive integer ticket id
export const ticketIdSchema = z.coerce
  .number({ message: "Ticket id must be a number" })
  .int("Ticket id must be a whole number")
  .positive("Ticket id must be positive")
  .max(2147483647, "Ticket id is too large");
