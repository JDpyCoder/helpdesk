import { z } from "zod";

const nameField = z.string().trim().min(3, "Name must be at least 3 characters");
// Trim before validating, so pasted addresses with surrounding spaces are accepted
const emailField = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));
// Matches Better Auth's default min/max password length
const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

// POST /api/users body. Validated by the CreateUserDialog form and again by the server.
export const createUserSchema = z.object({
  name: nameField,
  email: emailField,
  password: passwordField,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

// PATCH /api/users/:id body. A blank password keeps the user's current password.
export const updateUserSchema = z.object({
  name: nameField,
  email: emailField,
  password: z.union([z.literal(""), passwordField]),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
