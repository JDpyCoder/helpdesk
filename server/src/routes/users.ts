import { createUserSchema, updateUserSchema } from "core";
import { Router, type Response } from "express";
import { auth } from "../auth.ts";
import { prisma } from "../db.ts";
import { Role } from "../generated/prisma/enums.ts";
import { sendValidationError } from "../lib/validation.ts";
import { requireAdmin } from "../middleware/requireAdmin.ts";
import { requireAuth, type AuthLocals } from "../middleware/requireAuth.ts";

// User management: mounted at /api/users, admins only
export const usersRouter = Router();

usersRouter.use(requireAuth, requireAdmin);

// Explicit select: never leak sessions, accounts, or password hashes
const userSelect = { id: true, name: true, email: true, role: true, createdAt: true } as const;

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: userSelect,
    orderBy: { createdAt: "asc" },
  });
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

  if (!(await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } }))) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const ctx = await auth.$context;
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

// Soft delete: the row stays, but the user leaves the list, can't sign in and is signed out now.
// The email is rewritten to a tombstone so the address can be reused; admins can't be deleted.
usersRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: { email: true, role: true } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.role === Role.ADMIN) {
    res.status(403).json({ error: "Admins can't be deleted" });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { deletedAt: new Date(), email: `deleted+${id}+${user.email}` } }),
    prisma.session.deleteMany({ where: { userId: id } }),
  ]);
  res.status(204).end();
});
