import { useMemo, useState } from "react";
import { Button, TextInput } from "@carbon/react";
import { buildRating } from "@flowplan/core/engine/rating";
import { modelDiff } from "@flowplan/core/engine/diff";
import type { FlowPlanApi } from "../store/useFlowPlan";
import { TEAL, AMBER, RED, TEXTD } from "./colors";

// Snapshots panel (audit C-10, spec §6). Freeze the current layout as an
// immutable release, list every release newest-first, and — because a raw model
// dump is useless — diff any release against the current working model so an
// engineer sees exactly what changed since it was frozen, and restore it.

function when(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
}

export function SnapshotsPanel({ api }: { api: FlowPlanApi }) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [openDiff, setOpenDiff] = useState<string | null>(null);

  const currentLetter = api.rating.letter;

  const capture = () => {
    api.captureSnapshot(label || "Release " + (api.snapshots.length + 1), note);
    setLabel("");
    setNote("");
  };

  return (
    <div className="pad snaps">
      <div className="lab" style={{ marginBottom: 8 }}>Snapshots <span style={{ color: TEXTD, fontWeight: 400 }}>· immutable releases</span></div>
      <div style={{ fontSize: "0.75rem", color: TEXTD, marginBottom: 12, lineHeight: 1.5 }}>
        Freeze the current layout as a release you can always return to and diff against. Snapshots are
        immutable — later edits never change them — so an approved state stays reconstructible (§6).
      </div>

      <div className="snaps__capture">
        <TextInput id="snap-label" labelText="Label" placeholder="e.g. Gate-2 release" value={label} size="sm" onChange={(e) => setLabel(e.target.value)} />
        <TextInput id="snap-note" labelText="Note (optional)" placeholder="what changed / why" value={note} size="sm" onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" kind="primary" onClick={capture}>Capture current</Button>
      </div>

      {api.snapshots.length === 0 ? (
        <div style={{ color: TEXTD, fontSize: "0.75rem", marginTop: 16 }}>No snapshots yet — capture one to bookmark this state.</div>
      ) : (
        <ul className="snaps__list">
          {api.snapshots.map((s) => {
            const parentIdx = s.parentId ? api.snapshots.findIndex((x) => x.id === s.parentId) : -1;
            return (
              <li key={s.id} className="snaps__item">
                <div className="snaps__head">
                  <span className="snaps__label">{s.label}</span>
                  <span className="snaps__time">{when(s.createdAt)}</span>
                </div>
                {s.note ? <div className="snaps__note">{s.note}</div> : null}
                <div className="snaps__meta">
                  schema v{s.schemaVersion}
                  {s.parentId ? <> · from <em>{parentIdx >= 0 ? api.snapshots[parentIdx].label : "an earlier release"}</em></> : null}
                </div>
                <div className="snaps__actions">
                  <button className="snaps__btn" onClick={() => setOpenDiff(openDiff === s.id ? null : s.id)}>{openDiff === s.id ? "Hide diff" : "Diff vs current"}</button>
                  <button className="snaps__btn" onClick={() => { if (window.confirm(`Restore "${s.label}"? This replaces the current working layout — capture it first if you want to keep it.`)) api.restoreSnapshot(s.id); }}>Restore</button>
                  <button className="snaps__btn snaps__btn--danger" onClick={() => { if (window.confirm(`Delete snapshot "${s.label}"? This cannot be undone.`)) api.deleteSnapshot(s.id); }}>Delete</button>
                </div>
                {openDiff === s.id ? <SnapshotDiff snapModel={s.model} current={api.model} currentLetter={currentLetter} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SnapshotDiff({ snapModel, current, currentLetter }: { snapModel: import("@flowplan/core/model/types").Model; current: import("@flowplan/core/model/types").Model; currentLetter: string }) {
  // Diff reads snapshot → current: "what changed since this release".
  const diff = useMemo(() => modelDiff(snapModel, current), [snapModel, current]);
  const snapLetter = useMemo(() => buildRating(snapModel).letter, [snapModel]);
  return (
    <div className="snaps__diff">
      <div className="snaps__diffhead">
        <span>Grade <strong>{snapLetter}</strong> → <strong>{currentLetter}</strong></span>
        <span style={{ color: diff.changed ? AMBER : TEAL }}>{diff.summary}</span>
      </div>
      {diff.stations.length > 0 ? (
        <ul className="snaps__difflist">
          {diff.stations.map((s) => (
            <li key={s.id}>
              <span
                className="snaps__diffkind"
                style={{ color: s.kind === "added" ? TEAL : s.kind === "removed" ? RED : AMBER }}
              >
                {s.kind === "added" ? "＋" : s.kind === "removed" ? "－" : "~"}
              </span>
              <span className="snaps__diffname">{s.name}</span>
              {s.fields.length > 0 ? (
                <span className="snaps__difffields">
                  {s.fields.map((f) => `${f.field} ${f.from}→${f.to}`).join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
