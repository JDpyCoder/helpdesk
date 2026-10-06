import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db.ts";

const clientOrigin = process.env.CLIENT_ORIGIN;
if (!clientOrigin) {
  throw new Error("CLIENT_ORIGIN must be set in server/.env");
}

// Sessions are stored in the database (no cookie cache), so every
// getSession call hits the `session` table and revocation is immediate.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Admins create agents; the first admin comes from `bun run db:seed`
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      // Mirrors the Prisma `Role` enum; server-owned, so clients can't set it
      role: {
        type: ["ADMIN", "AGENT"],
        required: false,
        defaultValue: "AGENT",
        input: false,
      },
    },
  },
  trustedOrigins: [clientOrigin],
});
