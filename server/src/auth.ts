import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db.ts";
import { Role } from "./generated/prisma/enums.ts";

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
  // Production only, so dev and e2e runs can sign in repeatedly from one IP;
  // sign-in gets a tighter limit to slow password guessing
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
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
        type: [Role.ADMIN, Role.AGENT],
        required: false,
        defaultValue: Role.AGENT,
        input: false,
      },
    },
  },
  advanced: {
    // Better Auth skips origin/CSRF checks when NODE_ENV=test; pin them on so the
    // e2e stack (NODE_ENV=test) enforces trustedOrigins exactly like production
    disableOriginCheck: false,
    // Set by app.ts from Express's trust-proxy-aware req.ip; never taken from the client
    ipAddress: { ipAddressHeaders: ["x-client-ip"] },
  },
  trustedOrigins: [clientOrigin],
});
