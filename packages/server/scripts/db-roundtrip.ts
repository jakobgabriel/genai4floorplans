/* eslint-disable no-console */
// One-shot end-to-end check: boots the real Express app against the real
// Postgres (no mocks), then drives the same chain the web bootstrap does —
// login → team → workspace tree round-trip → library custom entry → subflow.
// Run: DATABASE_URL=... JWT_SECRET=... npx tsx scripts/db-roundtrip.ts
import request from "supertest";
import { createApp } from "../src/app.ts";

const app = createApp();
const agent = request.agent(app);
let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? "✓" : "✗"} ${label}${cond ? "" : "  " + JSON.stringify(extra)}`);
  if (!cond) failures++;
}

async function main() {
  const login = await agent.post("/api/auth/login").send({ email: "dev@flowplan.local", password: "devdevdev" });
  check("login 200", login.status === 200, login.body);

  const me = await agent.get("/api/auth/me");
  check("auth/me 200", me.status === 200, me.body);

  const teams = await agent.get("/api/teams");
  const teamId = teams.body.teams?.[0]?.id;
  check("teams non-empty", !!teamId, teams.body);

  const ws = await agent.get(`/api/teams/${teamId}/workspaces`);
  const wsId = ws.body.workspaces?.[0]?.id;
  check("workspace exists", !!wsId, ws.body);

  // --- workspace tree round-trip: hydrate, mutate a cell name, PUT, re-hydrate ---
  const hydrated = await agent.get(`/api/workspaces/${wsId}`);
  check("hydrate 200", hydrated.status === 200, hydrated.body);
  const tree = hydrated.body.workspace;
  const stamp = "rt-" + tree.cells.length + "-" + (tree.cells[0]?.name?.length ?? 0);
  const put = await agent.put(`/api/workspaces/${wsId}/tree`).send({
    activeId: tree.activeId,
    folders: tree.folders.map((f: Record<string, unknown>) => ({ id: f.id, name: f.name, parentId: f.parentId, position: f.position, archived: !!f.archived })),
    concepts: tree.concepts.map((c: Record<string, unknown>) => ({ id: c.id, name: c.name, folderId: c.folderId, position: c.position, archived: !!c.archived })),
    cells: tree.cells.map((c: Record<string, unknown>, i: number) => ({ id: c.id, name: i === 0 ? stamp : c.name, model: c.model, conceptId: c.conceptId, folderId: c.folderId, position: 0, archived: !!c.archived })),
  });
  check("tree PUT 200", put.status === 200, put.body);
  const rehydrated = await agent.get(`/api/workspaces/${wsId}`);
  check("cell name persisted to DB", rehydrated.body.workspace.cells[0]?.name === stamp, { got: rehydrated.body.workspace.cells[0]?.name, want: stamp });

  // --- library custom entry round-trip ---
  const entry = { id: "tmp", name: "RT Weld " + stamp, category: "Join", type: "machine", cycleTimeSec: 42, custom: true };
  const created = await agent.post(`/api/teams/${teamId}/library`).send({ entry });
  const entryId = created.body.entry?.id;
  check("library POST 201", created.status === 201 && !!entryId, created.body);
  const libList = await agent.get(`/api/teams/${teamId}/library`);
  const foundCustom = libList.body.entries?.find((e: { id: string }) => e.id === entryId);
  check("custom entry is team-scoped (teamId set)", !!foundCustom && foundCustom.teamId === teamId, foundCustom);
  const globals = libList.body.entries?.filter((e: { teamId: string | null }) => e.teamId === null) ?? [];
  check("global catalog present (>=10)", globals.length >= 10, { globals: globals.length });
  const del = await agent.delete(`/api/teams/${teamId}/library/${entryId}`);
  check("library DELETE 204", del.status === 204, del.status);

  // --- subflow round-trip ---
  const sf = await agent.post(`/api/teams/${teamId}/subflows`).send({ name: "RT Cell " + stamp, data: { stations: [], flows: [], w: 2, h: 2, createdAt: 0 } });
  const sfId = sf.body.subflow?.id;
  check("subflow POST 201", sf.status === 201 && !!sfId, sf.body);
  const patched = await agent.patch(`/api/teams/${teamId}/subflows/${sfId}`).send({ name: "RT Cell renamed" });
  check("subflow PATCH 200", patched.status === 200 && patched.body.subflow?.name === "RT Cell renamed", patched.body);
  const sfDel = await agent.delete(`/api/teams/${teamId}/subflows/${sfId}`);
  check("subflow DELETE 204", sfDel.status === 204, sfDel.status);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
