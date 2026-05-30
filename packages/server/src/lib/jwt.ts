import jwt from "jsonwebtoken";
import { ENV } from "./env.ts";

export const SESSION_COOKIE = "flowplan_session";
const MAX_AGE_S = 7 * 24 * 60 * 60; // 7 days

export interface SessionPayload {
  sub: string; // userId
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, ENV.jwtSecret, { expiresIn: MAX_AGE_S });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, ENV.jwtSecret) as { sub?: unknown };
    if (typeof decoded.sub === "string") return { sub: decoded.sub };
    return null;
  } catch {
    return null;
  }
}

export const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: ENV.isProd,
  maxAge: MAX_AGE_S * 1000,
  path: "/",
};
