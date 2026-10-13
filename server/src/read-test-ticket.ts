import { prisma } from "./db.ts";
import { TicketStatus } from "./generated/prisma/enums.ts";

// Used only by the e2e suite (e2e/fixtures.ts → readTicket) to inspect a stored ticket,
// since there is no ticket API to read it yet. Prints the ticket and its messages as JSON.
// Input comes from env vars, like create-test-user.ts: E2E_TICKET_ID.
const dbName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!dbName.endsWith("_test")) {
  throw new Error(`Refusing to read a test ticket from "${dbName}": the database name must end with "_test"`);
}

const idInput = process.env.E2E_TICKET_ID ?? "";
if (!/^[1-9]\d*$/.test(idInput)) {
  throw new Error(`E2E_TICKET_ID must be a positive integer (got "${idInput}")`);
}
const id = Number(idInput);

// Optional E2E_TICKET_SET_STATUS (OPEN | RESOLVED | CLOSED) updates the status first, so a
// test can put a ticket into a state no API can reach yet (e.g. resolved, to test reopening).
const setStatus = process.env.E2E_TICKET_SET_STATUS;
if (setStatus) {
  if (!(Object.values(TicketStatus) as string[]).includes(setStatus)) {
    throw new Error(`E2E_TICKET_SET_STATUS must be one of ${Object.values(TicketStatus).join(", ")}`);
  }
  await prisma.ticket.update({ where: { id }, data: { status: setStatus as TicketStatus } });
}

const ticket = await prisma.ticket.findUnique({
  where: { id },
  include: { messages: { orderBy: { receivedAt: "asc" } } },
});
process.stdout.write(JSON.stringify(ticket));
await prisma.$disconnect();
