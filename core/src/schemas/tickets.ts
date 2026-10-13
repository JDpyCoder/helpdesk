import { z } from "zod";

// Must match the TicketStatus / TicketCategory enums in server/prisma/schema.prisma.
// Each name is both the value (TicketStatus.OPEN) and the type.
export const ticketStatusSchema = z.enum(["OPEN", "RESOLVED", "CLOSED"]);
export const TicketStatus = ticketStatusSchema.enum;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketCategorySchema = z.enum(["GENERAL_QUESTION", "TECHNICAL_QUESTION", "REFUND_REQUEST"]);
export const TicketCategory = ticketCategorySchema.enum;
export type TicketCategory = z.infer<typeof ticketCategorySchema>;

// GET /api/tickets query string: optional filters plus sorting (newest first by default)
export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  category: ticketCategorySchema.optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "subject"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
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
