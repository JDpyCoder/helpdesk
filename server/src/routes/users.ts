import { createUserSchema, updateUserSchema } from "core";
import { Router, type Response } from "express";
import { z } from "zod";
import { auth } from "../auth.ts";
import { prisma } from "../db.ts";
import { Role } from "../generated/prisma/enums.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { requireAuth, type AuthLocals } from "../middleware/requireAuth.ts";

// User management: mounted at /api/users, admins only
export const usersRouter = Router();

usersRouter.use(requireAuth, requireAdmin);

// Explicit select: never leak sessions, accounts, or password hashes
const userSelect = { id: true, name: true, email: true, role: true, createdAt: true } as const;

// 400 with the first message (for display) plus per-field messages
function sendValidationError(res: Response, error: z.ZodError) {
  const { fieldErrors } = z.flattenError(error);
  res.status(400).json({ error: error.issues[0]?.message ?? "Invalid input", fieldErrors });
}

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({ select: userSelect, orderBy: { createdAt: "asc" } });
  res.json({ users });
});

usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
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

// Updates name and email; a non-blank password replaces the current one. Role can't be changed here.
usersRouter.patch("/:id", async (req, res: Response<unknown, AuthLocals>) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const { name, email, password } = parsed.data;
  const { id } = req.params;

  const ctx = await auth.$context;
  if (!(await ctx.internalAdapter.findUserById(id))) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (existing && existing.user.id !== id) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  await ctx.internalAdapter.updateUser(id, { name, email });

  if (password) {
    const hash = await ctx.password.hash(password);
    if (await ctx.internalAdapter.findCredentialAccount(id)) {
      await ctx.internalAdapter.updatePassword(id, hash);
    } else {
      await ctx.internalAdapter.linkAccount({ providerId: "credential", accountId: id, userId: id, password: hash });
    }
    // The old password must stop working everywhere; an admin editing themselves keeps this session
    await prisma.session.deleteMany({ where: { userId: id, token: { not: res.locals.session.token } } });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: userSelect });
  res.json({ user });
});
