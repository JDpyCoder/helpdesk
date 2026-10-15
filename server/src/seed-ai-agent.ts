import { auth } from "./auth.ts";
import { prisma } from "./db.ts";
import { Role, SenderType, TicketStatus } from "./generated/prisma/enums.ts";
import { AI_AGENT_EMAIL, AI_AGENT_NAME } from "./lib/ai-agent.ts";

// Creates the AI Agent user that auto-resolution assigns tickets to, and gives it the tickets it had already
// resolved (idempotent).
// No credential account is linked, so nobody can sign in as it.
const ctx = await auth.$context;

const existing = await ctx.internalAdapter.findUserByEmail(AI_AGENT_EMAIL);
if (existing) {
  console.log(`User ${AI_AGENT_EMAIL} already exists — nothing to do`);
} else {
  await ctx.internalAdapter.createUser(
    { email: AI_AGENT_EMAIL, name: AI_AGENT_NAME, emailVerified: true, role: Role.AGENT },
    { method: "admin" }
  );
  console.log(`Created AI agent user ${AI_AGENT_EMAIL}`);
}

// Tickets the AI resolved before the AI Agent existed: still resolved, unassigned, with an AI reply
const aiAgent = await ctx.internalAdapter.findUserByEmail(AI_AGENT_EMAIL);
if (aiAgent) {
  const { count } = await prisma.ticket.updateMany({
    where: {
      status: { in: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
      assignedToId: null,
      messages: { some: { senderType: SenderType.AI } },
    },
    data: { assignedToId: aiAgent.user.id },
  });
  if (count > 0) console.log(`Assigned ${count} ticket(s) the AI had resolved to ${AI_AGENT_NAME}`);
}

await prisma.$disconnect();
