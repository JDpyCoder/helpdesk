import { z } from "zod";

// Message-IDs are kept as sent (including angle brackets) so they compare exactly
const messageIdField = z.string().trim().min(1).max(998);

// POST /api/inbound-email body: one received email, already normalised from whatever
// delivered it (an email provider's webhook, a forwarding script, a test).
export const inboundEmailSchema = z.object({
  from: z.object({
    email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid sender email address")),
    name: z.string().trim().min(1, "Sender name is required").max(200, "Sender name must be at most 200 characters"),
  }),
  // 998 is the RFC 5322 line-length limit; a blank subject still makes a usable ticket
  subject: z
    .string()
    .trim()
    .max(998, "Subject must be at most 998 characters")
    .transform((subject) => subject || "(no subject)"),
  text: z.string().max(100_000, "Body must be at most 100,000 characters"),
  messageId: messageIdField.optional(),
  inReplyTo: messageIdField.optional(),
  references: z.array(messageIdField).max(100).optional(),
  receivedAt: z.iso.datetime({ offset: true }).optional(),
});

export type InboundEmailInput = z.infer<typeof inboundEmailSchema>;
