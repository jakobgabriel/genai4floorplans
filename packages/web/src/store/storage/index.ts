import { LocalStorageProvider } from "./LocalStorageProvider";
import { ApiStorageProvider } from "./ApiStorageProvider";
import type { StorageProvider } from "./StorageProvider";

export type { StorageProvider };
export { LocalStorageProvider, ApiStorageProvider };

// Session context decides the backing store: signed-out → localStorage (today's
// offline behavior), signed-in with a selected cloud workspace → the API.
export interface SessionContext {
  workspaceId: string | null;
}

export function pickProvider(session: SessionContext): StorageProvider {
  if (session.workspaceId) return new ApiStorageProvider(session.workspaceId);
  return new LocalStorageProvider();
}
