import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db.ts";

const clientOrigin = process.env.CLIENT_ORIGIN;
if (!clientOrigin) {
  throw new Error("CLIENT_ORIGIN must be set in server/.env");
}

// Without a secret Better Auth silently falls back to a public default in development
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret.length < 32) {
  throw new Error(
    "BETTER_AUTH_SECRET must be set in server/.env to at least 32 characters (openssl rand -base64 32)"
  );
}

// Sessions are stored in the database (no cookie cache), so every
// getSession call hits the `session` table and revocation is immediate.
export const auth = betterAuth({
  secret,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // On in every environment (Better Auth only enables it in production by default);
  // sign-in gets a tighter limit to slow password guessing
  rateLimit: {
    enabled: true,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
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
  advanced: {
    // Set by app.ts from Express's trust-proxy-aware req.ip; never taken from the client
    ipAddress: { ipAddressHeaders: ["x-client-ip"] },
  },
  trustedOrigins: [clientOrigin],
});
