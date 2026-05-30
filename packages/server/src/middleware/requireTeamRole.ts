import type { NextFunction, Response } from "express";
import type { Role } from "@prisma/client";
import { getPrisma } from "../lib/prisma.ts";
import { forbidden, notFound, unauthorized } from "../lib/http.ts";
import { ROLE_RANK, type AuthedRequest } from "./types.ts";

// Resolve the team a request targets from whichever route param is present.
// Returns the teamId, or null if the resource doesn't exist.
async function resolveTeamId(req: AuthedRequest): Promise<string | null> {
  const p = req.params;
  if (p.teamId) return p.teamId;
  const prisma = getPrisma();
  if (p.wsId) {
    const ws = await prisma.workspace.findUnique({ where: { id: p.wsId }, select: { teamId: true } });
    return ws?.teamId ?? null;
  }
  if (p.cellId) {
    const cell = await prisma.cell.findUnique({
      where: { id: p.cellId },
      select: { workspace: { select: { teamId: true } } },
    });
    return cell?.workspace.teamId ?? null;
  }
  return null;
}

// Gate a route by team membership role. Resolves the team scope, loads the
// caller's membership, and asserts role >= min. Attaches req.teamId / req.role.
// Returns 404 (not 403) when the caller isn't a member, so resource existence
// isn't leaked to outsiders.
export function requireTeamRole(min: Role) {
  return async function (req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
    if (!req.userId) return next(unauthorized());
    const teamId = await resolveTeamId(req);
    if (!teamId) return next(notFound());
    const membership = await getPrisma().membership.findUnique({
      where: { userId_teamId: { userId: req.userId, teamId } },
      select: { role: true },
    });
    if (!membership) return next(notFound());
    if (ROLE_RANK[membership.role] < ROLE_RANK[min]) return next(forbidden());
    req.teamId = teamId;
    req.role = membership.role;
    next();
  };
}
