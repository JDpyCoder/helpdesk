import { z } from "zod";

// POST /api/users body. Validated by the CreateUserDialog form and again by the server.
export const createUserSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters"),
  email: z.email("Enter a valid email address").trim().toLowerCase(),
  // Matches Better Auth's default min/max password length
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password must be at most 128 characters"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
