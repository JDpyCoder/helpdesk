import { PgBoss } from "pg-boss";
import { autoResolveStoredTicket, releaseTicket } from "./auto-resolve-ticket.ts";
import { classifyStoredTicket, isClassificationConfigured } from "./classify-ticket.ts";

// Background jobs, stored by pg-boss in the "pgboss" schema of the app's database (outside Prisma's
// "public" schema), so queued work survives a restart. The worker runs in the API process (index.ts).
export const CLASSIFY_TICKET_QUEUE = "classify-ticket";
export const AUTO_RESOLVE_TICKET_QUEUE = "auto-resolve-ticket";
// Gets auto-resolve jobs whose retries ran out; its worker hands those tickets to the agents
export const AUTO_RESOLVE_FAILED_QUEUE = "auto-resolve-ticket-failed";

export type ClassifyTicketJob = { ticketId: number };
export type AutoResolveTicketJob = { ticketId: number };

let boss: PgBoss | undefined;

function getBoss() {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set — copy server/.env.example to server/.env");
    }
    boss = new PgBoss({ connectionString });
    boss.on("error", (err) => console.error("pg-boss error", err));
  }
  return boss;
}

// Gemini failures are mostly rate limits and overload, so retry with growing gaps (about 1, 2, 4, 8…
// minutes, then hourly): 30 retries cover roughly a day, long enough for a daily quota to reset.
const classifyRetries = { retryLimit: 30, retryDelay: 60, retryBackoff: true };
// A Gemini failure releases the ticket at once (see auto-resolve-ticket.ts), so these retries only cover database
// errors: give up quickly (about 30s, 1 and 2 minutes), since the ticket is hidden from agents meanwhile
const autoResolveRetries = { retryLimit: 3, retryDelay: 30, retryBackoff: true };
// Releasing a ticket is a quick database write; retry it a few times in case the database was briefly down
const releaseRetries = { retryLimit: 10, retryDelay: 30, retryBackoff: true };

// Starts pg-boss and sets up the queues, without a worker (scripts that only queue jobs use this)
export async function startQueues() {
  const boss = getBoss();
  await boss.start();
  // createQueue ignores a queue that already exists, so updateQueue applies changed retry settings.
  // retryDelayMax can only be set when the queue is created.
  await boss.createQueue(CLASSIFY_TICKET_QUEUE, { ...classifyRetries, retryDelayMax: 3600 });
  await boss.updateQueue(CLASSIFY_TICKET_QUEUE, classifyRetries);
  // The dead letter queue must exist before a queue names it
  await boss.createQueue(AUTO_RESOLVE_FAILED_QUEUE, releaseRetries);
  await boss.updateQueue(AUTO_RESOLVE_FAILED_QUEUE, releaseRetries);
  await boss.createQueue(AUTO_RESOLVE_TICKET_QUEUE, { ...autoResolveRetries, deadLetter: AUTO_RESOLVE_FAILED_QUEUE });
  await boss.updateQueue(AUTO_RESOLVE_TICKET_QUEUE, { ...autoResolveRetries, deadLetter: AUTO_RESOLVE_FAILED_QUEUE });
  return boss;
}

// Does nothing while Gemini isn't configured (also the case in e2e), since no jobs are queued then
export async function startJobs() {
  if (!isClassificationConfigured()) return;
  const boss = await startQueues();
  await boss.work<ClassifyTicketJob>(CLASSIFY_TICKET_QUEUE, async ([job]) => {
    await classifyStoredTicket(job!.data.ticketId);
  });
  await boss.work<AutoResolveTicketJob>(AUTO_RESOLVE_TICKET_QUEUE, async ([job]) => {
    await autoResolveStoredTicket(job!.data.ticketId);
  });
  await boss.work<AutoResolveTicketJob>(AUTO_RESOLVE_FAILED_QUEUE, async ([job]) => {
    await releaseTicket(job!.data.ticketId);
  });
}

export async function stopJobs() {
  await boss?.stop();
}

// Queues AI classification of a new ticket. Never throws: a failure is logged and the ticket stays
// unclassified, so the email is still accepted. Nothing is queued while Gemini isn't configured.
export async function enqueueTicketClassification(ticketId: number) {
  if (!isClassificationConfigured()) return;
  try {
    await getBoss().send(CLASSIFY_TICKET_QUEUE, { ticketId } satisfies ClassifyTicketJob);
  } catch (err) {
    console.error(`Could not queue classification of ticket ${ticketId}`, err);
  }
}

// Queues an AI attempt to answer a NEW ticket from the knowledge base.
// Never throws: if queuing fails, the ticket is released to the agents (OPEN) so it isn't left waiting.
export async function enqueueTicketAutoResolution(ticketId: number) {
  try {
    await getBoss().send(AUTO_RESOLVE_TICKET_QUEUE, { ticketId } satisfies AutoResolveTicketJob);
  } catch (err) {
    console.error(`Could not queue auto-resolution of ticket ${ticketId}`, err);
    await releaseTicket(ticketId).catch((releaseErr) =>
      console.error(`Could not release ticket ${ticketId} to the agents`, releaseErr),
    );
  }
}
