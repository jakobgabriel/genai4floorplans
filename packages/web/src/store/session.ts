import type { Workspace } from "./workspace";
import type { StorageProvider } from "./storage/StorageProvider";
import type { ProcessCatalogEntry } from "@flowplan/core/model/catalog";
import type { Subflow } from "./subflows";

// The signed-in session, set once by the bootstrap (store/bootstrap.ts) before
// the app renders. When present, the app is DB-backed: loadWorkspace() returns
// the hydrated workspace and saveWorkspace() writes through the provider. When
// absent (unit tests, which never bootstrap), the stores fall back to
// localStorage — so the running app is DB-only while the test suite is intact.

export interface Session {
  userId: string;
  teamId: string;
  workspaceId: string;
}

interface SessionState {
  session: Session | null;
  provider: StorageProvider | null;
  workspace: Workspace | null;
  library: ProcessCatalogEntry[] | null;
  subflows: Subflow[] | null;
}

const state: SessionState = { session: null, provider: null, workspace: null, library: null, subflows: null };

export function setSession(s: SessionState): void {
  Object.assign(state, s);
}

export const getSession = (): Session | null => state.session;
export const getProvider = (): StorageProvider | null => state.provider;
export const getHydratedWorkspace = (): Workspace | null => state.workspace;
export const getHydratedLibrary = (): ProcessCatalogEntry[] | null => state.library;
export const getHydratedSubflows = (): Subflow[] | null => state.subflows;
