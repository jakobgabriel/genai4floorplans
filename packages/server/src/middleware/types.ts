import type { Request } from "express";
import type { Role } from "@prisma/client";

// Request augmentation populated by the auth/authz middleware chain.
export interface AuthedRequest extends Request {
  userId?: string;
  // Set by requireTeamRole / loadScopedResource once the team scope is resolved.
  teamId?: string;
  role?: Role;
}

// OWNER > EDITOR > VIEWER ordering for role gating.
export const ROLE_RANK: Record<Role, number> = {
  OWNER: 3,
  EDITOR: 2,
  VIEWER: 1,
};
