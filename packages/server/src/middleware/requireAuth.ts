import type { NextFunction, Response } from "express";
import { SESSION_COOKIE, verifySession } from "../lib/jwt.ts";
import { unauthorized } from "../lib/http.ts";
import type { AuthedRequest } from "./types.ts";

// Verifies the session and attaches req.userId. Stateless: no session table —
// the JWT is the source of truth, looked up fresh each request. Accepts the token
// from the httpOnly cookie (the SPA) or an `Authorization: Bearer <jwt>` header
// (API clients / Swagger's Authorize). The cookie takes precedence.
export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE] ?? bearerToken(req.headers.authorization);
  if (!token) return next(unauthorized());
  const payload = verifySession(token);
  if (!payload) return next(unauthorized("Invalid or expired session"));
  req.userId = payload.sub;
  next();
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && value ? value : undefined;
}
