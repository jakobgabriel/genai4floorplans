import { ApiStorageProvider } from "./storage/ApiStorageProvider";
import { setSession } from "./session";
import { hydrateScenarios } from "./scenarios";
import { authLogin, authMe, listTeams, createTeam, listWorkspaces, createWorkspace, fetchLibrary, fetchSubflows } from "./apiClient";

// Establish the DB-backed session before the app renders. In dev this
// auto-logs-in the seeded dev user (see prisma/seed.ts) so a fresh `npm run
// dev:all` opens a Postgres-backed workspace with zero friction. Returns true
// when a session was established; false means the app runs in its offline
// (localStorage) fallback — the only path the unit tests ever take.

const DEV_EMAIL = "dev@flowplan.local";
const DEV_PASSWORD = "devdevdev";

export async function bootstrapSession(): Promise<boolean> {
  try {
    // 1) Ensure we're signed in.
    let signedIn = false;
    try { await authMe(); signedIn = true; } catch { /* not signed in */ }
    if (!signedIn) {
      if (!import.meta.env.DEV) return false; // prod: a real login UI would go here
      await authLogin(DEV_EMAIL, DEV_PASSWORD);
    }

    // 2) Resolve (or create) a team.
    let teams = (await listTeams()).teams;
    if (teams.length === 0) { await createTeam("My Team"); teams = (await listTeams()).teams; }
    const teamId = teams[0].id;

    // 3) Resolve (or create) a workspace.
    let workspaces = (await listWorkspaces(teamId)).workspaces;
    if (workspaces.length === 0) { await createWorkspace(teamId, "Workspace"); workspaces = (await listWorkspaces(teamId)).workspaces; }
    const workspaceId = workspaces[0].id;

    // 4) Hydrate everything from the DB.
    const provider = new ApiStorageProvider(workspaceId);
    const [workspace, library, subflows, scenarios] = await Promise.all([
      provider.loadWorkspace(),
      fetchLibrary(teamId),
      fetchSubflows(teamId),
      hydrateScenarios(provider),
    ]);

    setSession({ session: { userId: "me", teamId, workspaceId }, provider, workspace, library, subflows, scenarios });
    return true;
  } catch (e) {
    console.warn("DB bootstrap failed; running offline (localStorage).", e);
    return false;
  }
}
