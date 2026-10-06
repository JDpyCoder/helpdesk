import { auth } from "./auth.ts";
import { prisma } from "./db.ts";
import { Role } from "./generated/prisma/enums.ts";

const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME ?? "Admin";

if (!email || !password) {
  throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in server/.env");
}

const ctx = await auth.$context;

const existing = await ctx.internalAdapter.findUserByEmail(email);
if (existing) {
  console.log(`User ${email} already exists — nothing to do`);
} else {
  // ctx.password.hash skips Better Auth's password-length check, so enforce one here
  if (password.length < 12 || password === "change-me-please") {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters and not the .env.example value");
  }
  const user = await ctx.internalAdapter.createUser(
    { email, name, emailVerified: true, role: Role.ADMIN },
    { method: "admin" }
  );
  await ctx.internalAdapter.linkAccount({
    providerId: "credential",
    accountId: user.id,
    userId: user.id,
    password: await ctx.password.hash(password),
  });
  console.log(`Created admin user ${email}`);
}

await prisma.$disconnect();
