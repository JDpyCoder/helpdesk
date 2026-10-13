import { z } from "zod";

// Must match the TicketStatus / TicketCategory enums in server/prisma/schema.prisma.
// Each name is both the value (TicketStatus.OPEN) and the type.
export const ticketStatusSchema = z.enum(["OPEN", "RESOLVED", "CLOSED"]);
export const TicketStatus = ticketStatusSchema.enum;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketCategorySchema = z.enum(["GENERAL_QUESTION", "TECHNICAL_QUESTION", "REFUND_REQUEST"]);
export const TicketCategory = ticketCategorySchema.enum;
export type TicketCategory = z.infer<typeof ticketCategorySchema>;

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

// GET /api/tickets query string: optional filters plus sorting (newest first by default)
export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  category: ticketCategoryFilterSchema.optional(),
  // Free text matched against subject, sender name and email; "42" or "#42" also matches ticket #42.
  // Blank means no search.
  search: z.string().trim().max(200, "Search must be at most 200 characters").optional(),
  sortBy: ticketSortFieldSchema.default("createdAt"),
  order: sortOrderSchema.default("desc"),
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
