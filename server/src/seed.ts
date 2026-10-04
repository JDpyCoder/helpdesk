import { auth } from "./auth.ts";
import { prisma } from "./db.ts";

// Creates the initial admin. Public sign-up is disabled, so this goes through
// Better Auth's internal adapter (same approach as its admin plugin).
const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const name = process.env.SEED_ADMIN_NAME ?? "Admin";

if (!email || !password) {
  throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in server/.env");
}

const ctx = await auth.$context;

if (await ctx.internalAdapter.findUserByEmail(email)) {
  console.log(`User ${email} already exists — nothing to do`);
} else {
  const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({
    providerId: "credential",
    accountId: user.id,
    userId: user.id,
    password: await ctx.password.hash(password),
  });
  console.log(`Created user ${email}`);
}

await prisma.$disconnect();
