import { Router } from "express";
import argon2 from "argon2";
import { getPrisma } from "../lib/prisma.ts";
import { signSession, SESSION_COOKIE, COOKIE_OPTS } from "../lib/jwt.ts";
import { asyncHandler, badRequest, conflict, unauthorized } from "../lib/http.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AuthedRequest } from "../middleware/types.ts";
import { RegisterBody, LoginBody } from "../openapi/schemas.ts";

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = RegisterBody.safeParse(req.body);
    if (!body.success) throw badRequest("email and password (min 8 chars) required");
    const prisma = getPrisma();
    const existing = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (existing) throw conflict("Email already registered");
    const passwordHash = await argon2.hash(body.data.password);
    const user = await prisma.user.create({
      data: { email: body.data.email, name: body.data.name, passwordHash },
      select: { id: true, email: true, name: true },
    });
    // Set the cookie (for the SPA) and also return the JWT (for API/Bearer clients).
    const token = signSession(user.id);
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTS);
    res.status(201).json({ user, token });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = LoginBody.safeParse(req.body);
    if (!body.success) throw badRequest("email and password required");
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (!user || !user.passwordHash || !(await argon2.verify(user.passwordHash, body.data.password))) {
      throw unauthorized("Invalid email or password");
    }
    const token = signSession(user.id);
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTS);
    res.json({ user: { id: user.id, email: user.email, name: user.name }, token });
  }),
);

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...COOKIE_OPTS, maxAge: undefined });
  res.status(204).end();
});

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        memberships: { select: { teamId: true, role: true, team: { select: { name: true } } } },
      },
    });
    if (!user) throw unauthorized();
    const { memberships, ...rest } = user;
    res.json({
      user: rest,
      memberships: memberships.map((m) => ({ teamId: m.teamId, role: m.role, teamName: m.team.name })),
    });
  }),
);
