import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { setPrisma } from "../lib/prisma.ts";

// Install a deep Prisma mock for a test and wire it into the injectable accessor.
// Handlers call getPrisma(), so they transparently use this mock — no live DB.
export function installMockPrisma(): DeepMockProxy<PrismaClient> {
  const prisma = mockDeep<PrismaClient>();
  setPrisma(prisma as unknown as PrismaClient);
  return prisma;
}

export function resetPrisma(): void {
  setPrisma(null);
}
