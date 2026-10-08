import { createUserSchema } from "core";
import { Router } from "express";
import { z } from "zod";
import { auth } from "../auth.ts";
import { prisma } from "../db.ts";
import { Role } from "../generated/prisma/enums.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { requireAuth } from "../middleware/requireAuth.ts";

// User management: mounted at /api/users, admins only
export const usersRouter = Router();

usersRouter.use(requireAuth, requireAdmin);

// Explicit select: never leak sessions, accounts, or password hashes
const userSelect = { id: true, name: true, email: true, role: true, createdAt: true } as const;

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({ select: userSelect, orderBy: { createdAt: "asc" } });
  res.json({ users });
});

usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    res.status(400).json({ error: Object.values(fieldErrors).flat()[0] ?? "Invalid input", fieldErrors });
    return;
  }
  const { name, email, password } = parsed.data;

  const ctx = await auth.$context;
  if (await ctx.internalAdapter.findUserByEmail(email)) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  // Same flow as seed.ts; users created here are always agents (the body can't pick a role)
  const created = await ctx.internalAdapter.createUser(
    { email, name, emailVerified: true, role: Role.AGENT },
    { method: "admin" }
  );
  await ctx.internalAdapter.linkAccount({
    providerId: "credential",
    accountId: created.id,
    userId: created.id,
    password: await ctx.password.hash(password),
  });

  const user = await prisma.user.findUniqueOrThrow({ where: { id: created.id }, select: userSelect });
  res.status(201).json({ user });
});
