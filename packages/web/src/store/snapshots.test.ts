// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { SAMPLE } from "@flowplan/core/model/sample";
import type { Model } from "@flowplan/core/model/types";
import { snapshotsFor, captureSnapshot, deleteSnapshot, clearSnapshots, restoreModel } from "./snapshots";

const clone = (): Model => JSON.parse(JSON.stringify(SAMPLE));

beforeEach(() => {
  localStorage.clear();
});

describe("snapshot store (audit C-10)", () => {
  it("captures and lists snapshots newest-first", () => {
    captureSnapshot("cell1", clone(), "first");
    captureSnapshot("cell1", clone(), "second");
    const list = snapshotsFor("cell1");
    expect(list).toHaveLength(2);
    expect(list[0].label).toBe("second"); // newest first
    expect(list[1].label).toBe("first");
  });

  it("is immutable — later edits to the live model never change a snapshot", () => {
    const m = clone();
    captureSnapshot("cell1", m, "frozen");
    const originalName = m.stations[0].name;
    m.stations[0].name = "MUTATED AFTER CAPTURE";
    m.stations.push({ ...m.stations[0], id: "new" });
    const snap = snapshotsFor("cell1")[0];
    expect(snap.model.stations[0].name).toBe(originalName);
    expect(snap.model.stations).not.toHaveLength(m.stations.length);
  });

  it("records lineage via parentId", () => {
    const base = captureSnapshot("cell1", clone(), "base");
    const child = captureSnapshot("cell1", clone(), "child", undefined, base.id);
    expect(child.parentId).toBe(base.id);
  });

  it("restoreModel returns a detached copy", () => {
    captureSnapshot("cell1", clone(), "r");
    const snap = snapshotsFor("cell1")[0];
    const restored = restoreModel(snap);
    restored.stations[0].name = "edited";
    expect(snap.model.stations[0].name).not.toBe("edited");
  });

  it("scopes snapshots per cell and deletes / clears correctly", () => {
    captureSnapshot("cellA", clone(), "a");
    captureSnapshot("cellB", clone(), "b");
    expect(snapshotsFor("cellA")).toHaveLength(1);
    expect(snapshotsFor("cellB")).toHaveLength(1);

    const a = snapshotsFor("cellA")[0];
    deleteSnapshot("cellA", a.id);
    expect(snapshotsFor("cellA")).toHaveLength(0);
    expect(snapshotsFor("cellB")).toHaveLength(1);

    clearSnapshots("cellB");
    expect(snapshotsFor("cellB")).toHaveLength(0);
  });
});
