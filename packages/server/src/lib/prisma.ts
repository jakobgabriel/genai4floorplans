import { PrismaClient } from "@prisma/client";

// Dependency-injected Prisma accessor: a single client in production, but
// overridable in tests with a deep mock (see test setup). Handlers call
// getPrisma() rather than importing a module-global, so they're unit-testable
// without a live database.
let client: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}

/** Test seam: swap in a mock (or null to reset to a real client on next get). */
export function setPrisma(mock: PrismaClient | null): void {
  client = mock;
}
