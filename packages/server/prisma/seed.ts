import argon2 from "argon2";
import { PrismaClient, Role } from "@prisma/client";
import { SAMPLE, blankModel } from "@flowplan/core/model/sample";
import { DEFAULT_CATALOG } from "@flowplan/core/model/catalog";
import { SCHEMA_VERSION } from "@flowplan/core/model/types";

// Idempotent dev seed: a dev User + Team + Workspace (with a sample layout) and
// the GLOBAL library catalog (teamId null). Lets `npm run dev:all` auto-login
// (DEV_USER_EMAIL/DEV_USER_PASSWORD) and open a DB-backed workspace with zero
// friction. Safe to re-run — everything is upserted / existence-checked.

export const DEV_USER_EMAIL = "dev@flowplan.local";
export const DEV_USER_PASSWORD = "devdevdev"; // dev-only, min 8 chars

const prisma = new PrismaClient();

async function main() {
  // 1) Global library catalog (teamId = null). Seed once.
  const globalCount = await prisma.libraryEntry.count({ where: { teamId: null } });
  if (globalCount === 0) {
    await prisma.libraryEntry.createMany({
      data: DEFAULT_CATALOG.map((entry) => ({ teamId: null, entry: entry as object })),
    });
    console.log(`seeded ${DEFAULT_CATALOG.length} global catalog entries`);
  }

  // 2) Dev user.
  const passwordHash = await argon2.hash(DEV_USER_PASSWORD);
  const user = await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    update: {},
    create: { email: DEV_USER_EMAIL, name: "Dev User", passwordHash },
    select: { id: true },
  });

  // 3) Dev team + OWNER membership.
  let membership = await prisma.membership.findFirst({ where: { userId: user.id }, select: { teamId: true } });
  if (!membership) {
    const team = await prisma.team.create({ data: { name: "Dev Team" }, select: { id: true } });
    await prisma.membership.create({ data: { userId: user.id, teamId: team.id, role: Role.OWNER } });
    membership = { teamId: team.id };
  }

  // 4) A workspace with a sample layout (concept + cell), if the team has none.
  const wsCount = await prisma.workspace.count({ where: { teamId: membership.teamId } });
  if (wsCount === 0) {
    const ws = await prisma.workspace.create({ data: { teamId: membership.teamId, name: "Dev Workspace" }, select: { id: true } });
    const concept = await prisma.concept.create({ data: { workspaceId: ws.id, name: SAMPLE.name || "Concept A", position: 0 }, select: { id: true } });
    const cell = await prisma.cell.create({
      data: { workspaceId: ws.id, conceptId: concept.id, name: SAMPLE.name || "Layout A", schemaVersion: SCHEMA_VERSION, model: (SAMPLE as unknown) as object, position: 0 },
      select: { id: true },
    });
    await prisma.workspace.update({ where: { id: ws.id }, data: { activeId: cell.id } });
    console.log(`seeded workspace ${ws.id} for team ${membership.teamId}`);
  }

  console.log(`dev user: ${DEV_USER_EMAIL} / ${DEV_USER_PASSWORD}`);
  // blankModel referenced so an unused-import lint never trips if SAMPLE changes.
  void blankModel;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
