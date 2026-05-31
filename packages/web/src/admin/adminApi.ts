// Thin client for the admin endpoints (teams / members / workspaces) and the
// light email-password sign-in. Uses the session cookie (credentials: include);
// the editor itself stays offline — only the Admin page talks to the backend.
export type Role = "OWNER" | "EDITOR" | "VIEWER";
export interface User { id: string; email: string; name: string | null }
export interface Membership { teamId: string; role: Role; teamName: string }
export interface TeamSummary { id: string; name: string; createdAt: string }
export interface TeamMember { userId: string; role: Role; user: { email: string; name: string | null } }
export interface TeamDetail { id: string; name: string; memberships: TeamMember[] }
export interface WorkspaceSummary { id: string; name: string; activeId: string | null; updatedAt: string }

const BASE = "/api";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const adminApi = {
  me: () => req<{ user: User; memberships: Membership[] }>("GET", "/auth/me"),
  login: (email: string, password: string) => req<{ user: User }>("POST", "/auth/login", { email, password }),
  register: (email: string, password: string, name?: string) => req<{ user: User }>("POST", "/auth/register", { email, password, name }),
  logout: () => req<void>("POST", "/auth/logout"),

  listTeams: () => req<{ teams: TeamSummary[] }>("GET", "/teams"),
  createTeam: (name: string) => req<{ team: TeamSummary }>("POST", "/teams", { name }),
  getTeam: (teamId: string) => req<{ team: TeamDetail }>("GET", `/teams/${teamId}`),

  addMember: (teamId: string, email: string, role: Role) => req("POST", `/teams/${teamId}/members`, { email, role }),
  updateMember: (teamId: string, userId: string, role: Role) => req("PATCH", `/teams/${teamId}/members/${userId}`, { role }),
  removeMember: (teamId: string, userId: string) => req<void>("DELETE", `/teams/${teamId}/members/${userId}`),

  listWorkspaces: (teamId: string) => req<{ workspaces: WorkspaceSummary[] }>("GET", `/teams/${teamId}/workspaces`),
  createWorkspace: (teamId: string, name: string) => req<{ workspace: { id: string; name: string } }>("POST", `/teams/${teamId}/workspaces`, { name }),
};
