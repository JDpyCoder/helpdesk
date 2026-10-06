import { auth } from "./auth.ts";
import { prisma } from "./db.ts";
import { Role } from "./generated/prisma/enums.ts";

// Used only by the e2e suite (e2e/helpers.ts) to create users in the test database,
// since public sign-up is disabled. Creates the user the same way src/seed.ts does.
// Input comes from env vars so no quoting survives a shell: E2E_USER_EMAIL,
// E2E_USER_PASSWORD, E2E_USER_NAME, E2E_USER_ROLE (ADMIN | AGENT).
const dbName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!dbName.endsWith("_test")) {
  throw new Error(`Refusing to create a test user in "${dbName}": the database name must end with "_test"`);
}

const email = process.env.E2E_USER_EMAIL?.toLowerCase();
const password = process.env.E2E_USER_PASSWORD;
const name = process.env.E2E_USER_NAME ?? "Test User";
const roleInput = process.env.E2E_USER_ROLE ?? Role.AGENT;

if (!email || !password) {
  throw new Error("E2E_USER_EMAIL and E2E_USER_PASSWORD must be set");
}
if (roleInput !== Role.ADMIN && roleInput !== Role.AGENT) {
  throw new Error(`E2E_USER_ROLE must be ADMIN or AGENT (got "${roleInput}")`);
}

const ctx = await auth.$context;
if (await ctx.internalAdapter.findUserByEmail(email)) {
  throw new Error(`User ${email} already exists`);
}

const user = await ctx.internalAdapter.createUser(
  { email, name, emailVerified: true, role: roleInput },
  { method: "admin" }
);
await ctx.internalAdapter.linkAccount({
  providerId: "credential",
  accountId: user.id,
  userId: user.id,
  password: await ctx.password.hash(password),
});

console.log(`Created ${roleInput} user ${email}`);
await prisma.$disconnect();
