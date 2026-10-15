import { prisma } from "../db.ts";

// The "AI Agent" user (created by `bun run db:seed:ai-agent`) owns a ticket while the AI tries to
// auto-resolve it, so tickets it resolves stay assigned to it. It has no password and can't sign in.
export const AI_AGENT_EMAIL = "ai-agent@helpdesk.local";
export const AI_AGENT_NAME = "AI Agent";

// Leaves the AI Agent out of user queries meant for people (users list, assignee options)
export const humanUserWhere = { email: { not: AI_AGENT_EMAIL } } as const;

// The AI Agent's user id, or null when it hasn't been seeded (tickets then stay unassigned)
export async function getAiAgentId(): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { email: AI_AGENT_EMAIL, deletedAt: null },
    select: { id: true },
  });
  return user?.id ?? null;
}
