import { Router } from "express";
import { prisma } from "../db.ts";
import { Role } from "../generated/prisma/enums.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

// Agents tickets can be assigned to: mounted at /api/agents, for any signed-in agent or admin.
// Unlike /api/users (admin only), it exposes just ids and names.
export const agentsRouter = Router();

agentsRouter.use(requireAuth);

// Active (not soft-deleted) agents, by name
agentsRouter.get("/", async (_req, res) => {
  const agents = await prisma.user.findMany({
    where: { role: Role.AGENT, deletedAt: null },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  res.json({ agents });
});
