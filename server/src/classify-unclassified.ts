import { prisma } from "./db.ts";
import { isClassificationConfigured } from "./lib/classify-ticket.ts";
import { CLASSIFY_TICKET_QUEUE, type ClassifyTicketJob, startQueues, stopJobs } from "./lib/jobs.ts";

// Queues AI classification for every ticket that has no category and no classification job waiting
// (bun run jobs:classify-unclassified). The running server's worker does the classifying.
// Safe to run again: tickets that already have a queued or retrying job are skipped.

if (!isClassificationConfigured()) {
  console.error("GOOGLE_GENERATIVE_AI_API_KEY is not set — nothing to queue");
  process.exit(1);
}

const boss = await startQueues();

const waiting = await boss.findJobs<ClassifyTicketJob>(CLASSIFY_TICKET_QUEUE, { queued: true, limit: 100_000 });
const alreadyQueued = new Set(waiting.map((job) => job.data.ticketId));

const tickets = await prisma.ticket.findMany({ where: { category: null }, select: { id: true }, orderBy: { id: "asc" } });
const toQueue = tickets.map((t) => t.id).filter((id) => !alreadyQueued.has(id));

for (const ticketId of toQueue) {
  await boss.send(CLASSIFY_TICKET_QUEUE, { ticketId } satisfies ClassifyTicketJob);
}

console.log(
  `Queued ${toQueue.length} ticket(s)${toQueue.length ? `: ${toQueue.map((id) => `#${id}`).join(", ")}` : ""}` +
    ` (${tickets.length - toQueue.length} unclassified already had a job waiting)`,
);

await stopJobs();
await prisma.$disconnect();
