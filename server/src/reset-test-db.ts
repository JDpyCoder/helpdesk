import { prisma } from "./db.ts";

// Empties every table so each e2e run starts from a clean slate. Migrations are
// applied separately (prisma migrate deploy); this only removes rows.
const dbName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!dbName.endsWith("_test")) {
  throw new Error(`Refusing to reset "${dbName}": the test database name must end with "_test"`);
}

const tables = await prisma.$queryRaw<{ tablename: string }[]>`
  SELECT tablename FROM pg_tables
  WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'
`;

if (tables.length > 0) {
  const list = tables.map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

console.log(`Reset ${dbName} (${tables.length} tables emptied)`);
await prisma.$disconnect();
