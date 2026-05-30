import { signSession, SESSION_COOKIE } from "../lib/jwt.ts";

// Build a Cookie header carrying a valid session for the given user id.
export function sessionCookie(userId: string): string {
  return `${SESSION_COOKIE}=${signSession(userId)}`;
}
