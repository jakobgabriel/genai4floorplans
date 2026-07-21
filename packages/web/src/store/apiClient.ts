import type { ProcessCatalogEntry } from "@flowplan/core/model/catalog";
import type { Subflow } from "./subflows";

// Thin fetch client for the auth + team-scoped resources the bootstrap and the
// library/subflow stores need. Cookie-based session (credentials: "include").
const BASE = "/api";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${method} ${path} → ${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---- auth / bootstrap ----
export const authMe = () => req<{ user: { id: string; email: string } }>("GET", "/auth/me");
export const authLogin = (email: string, password: string) => req<{ user: { id: string } }>("POST", "/auth/login", { email, password });
export const listTeams = () => req<{ teams: { id: string; name: string }[] }>("GET", "/teams");
export const createTeam = (name: string) => req<{ team: { id: string } }>("POST", "/teams", { name });
export const listWorkspaces = (teamId: string) => req<{ workspaces: { id: string; name: string }[] }>("GET", `/teams/${teamId}/workspaces`);
export const createWorkspace = (teamId: string, name: string) => req<{ workspace: { id: string } }>("POST", `/teams/${teamId}/workspaces`, { name });

// ---- library (global catalog + team customs) ----
type LibRow = { id: string; teamId: string | null; entry: Record<string, unknown> };
function rowToEntry(r: LibRow): ProcessCatalogEntry {
  // The DB row id is the stable id the client edits/deletes by; provenance from teamId.
  return { ...(r.entry as unknown as ProcessCatalogEntry), id: r.id, custom: r.teamId != null };
}
export async function fetchLibrary(teamId: string): Promise<ProcessCatalogEntry[]> {
  const { entries } = await req<{ entries: LibRow[] }>("GET", `/teams/${teamId}/library`);
  return entries.map(rowToEntry);
}
export async function createLibraryEntry(teamId: string, entry: ProcessCatalogEntry): Promise<ProcessCatalogEntry> {
  const { entry: row } = await req<{ entry: LibRow }>("POST", `/teams/${teamId}/library`, { entry });
  return rowToEntry(row);
}
export const updateLibraryEntry = (teamId: string, id: string, entry: ProcessCatalogEntry) =>
  req("PATCH", `/teams/${teamId}/library/${id}`, { entry });
export const deleteLibraryEntry = (teamId: string, id: string) => req("DELETE", `/teams/${teamId}/library/${id}`);

// ---- subflows ----
type SubRow = { id: string; teamId: string; name: string; data: Record<string, unknown> };
function rowToSubflow(r: SubRow): Subflow {
  const d = r.data as Partial<Subflow>;
  return { id: r.id, name: r.name, category: d.category, stations: d.stations ?? [], flows: d.flows ?? [], w: d.w ?? 0, h: d.h ?? 0, createdAt: d.createdAt ?? 0 };
}
export async function fetchSubflows(teamId: string): Promise<Subflow[]> {
  const { subflows } = await req<{ subflows: SubRow[] }>("GET", `/teams/${teamId}/subflows`);
  return subflows.map(rowToSubflow);
}
export async function createSubflow(teamId: string, sf: Subflow): Promise<Subflow> {
  const { subflow } = await req<{ subflow: SubRow }>("POST", `/teams/${teamId}/subflows`, {
    name: sf.name,
    data: { category: sf.category, stations: sf.stations, flows: sf.flows, w: sf.w, h: sf.h, createdAt: sf.createdAt },
  });
  return rowToSubflow(subflow);
}
export const updateSubflow = (teamId: string, id: string, patch: { name?: string }) =>
  req("PATCH", `/teams/${teamId}/subflows/${id}`, patch);
export const deleteSubflow = (teamId: string, id: string) => req("DELETE", `/teams/${teamId}/subflows/${id}`);
