import type { NextFunction, Response } from "express";
import { SESSION_COOKIE, verifySession } from "../lib/jwt.ts";
import { unauthorized } from "../lib/http.ts";
import type { AuthedRequest } from "./types.ts";

// Verifies the httpOnly session cookie and attaches req.userId. Stateless: no
// session table — the JWT is the source of truth, looked up fresh each request.
export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next(unauthorized());
  const payload = verifySession(token);
  if (!payload) return next(unauthorized("Invalid or expired session"));
  req.userId = payload.sub;
  next();
}
