import type { VariantMode, WorkElement } from "../model/types";
import { modesOf, multiplierFor } from "./workload";

// Freedom-finding pass (blueprint §4.8).
//
// A linear routing implies a compulsory sequence that mostly does not exist.
// An edge is real only where it is *physically* compulsory — not because it has
// always been done that way. This pass classifies each work element by how much
// placement freedom its precedence actually leaves, so the balancer knows which
// operations it may move to fill an under-loaded station.
//
// It is deliberately structural, not physical: it can only read the declared
// precedence and mode membership, so it reports what the graph allows and says
// why. A `free` operation is the balancing gain the tool exists to surface — in
// the blueprint's worked example a single free op (the type plate) fills the
// under-loaded station.

export type FreedomFinding = "free" | "swappable" | "exclusive" | "compulsory";

export interface ElementFreedom {
  elementId: string;
  name: string;
  finding: FreedomFinding;
  reason: string;
}

export interface FreedomResult {
  elements: ElementFreedom[];
  counts: Record<FreedomFinding, number>;
}

/** Transitive ancestor sets over the precedence DAG (direct + indirect preds). */
function ancestorSets(elements: WorkElement[]): Record<string, Set<string>> {
  const ids = new Set(elements.map((e) => e.id));
  const direct: Record<string, string[]> = {};
  elements.forEach((e) => {
    direct[e.id] = e.predecessors.filter((p) => ids.has(p));
  });
  const memo: Record<string, Set<string>> = {};
  const visiting = new Set<string>();
  function anc(id: string): Set<string> {
    if (memo[id]) return memo[id];
    if (visiting.has(id)) return new Set(); // cycle guard
    visiting.add(id);
    const acc = new Set<string>();
    for (const p of direct[id] ?? []) {
      acc.add(p);
      anc(p).forEach((x) => acc.add(x));
    }
    visiting.delete(id);
    memo[id] = acc;
    return acc;
  }
  elements.forEach((e) => anc(e.id));
  return memo;
}

/** Modes in which an element is active (multiplier > 0). */
function activeModes(el: WorkElement, modes: VariantMode[]): Set<string> {
  return new Set(modes.filter((m) => multiplierFor(m, el.id) > 0).map((m) => m.id));
}

function nameOf(elements: WorkElement[], id: string): string {
  return elements.find((e) => e.id === id)?.name ?? id;
}

export function classifyFreedom(
  elements: WorkElement[],
  variantModes?: VariantMode[],
): FreedomResult {
  const modes = modesOf(variantModes);
  const declaredModes = variantModes && variantModes.length > 0;
  const ids = new Set(elements.map((e) => e.id));
  const rootIds = new Set(elements.filter((e) => e.predecessors.filter((p) => ids.has(p)).length === 0).map((e) => e.id));
  const anc = ancestorSets(elements);
  const active: Record<string, Set<string>> = {};
  elements.forEach((e) => (active[e.id] = activeModes(e, modes)));

  const findings: ElementFreedom[] = elements.map((e) => {
    const preds = e.predecessors.filter((p) => ids.has(p));

    // Exclusive: only meaningful when modes are declared. Two elements that never
    // run in the same mode can share a station — a real balancing gain.
    if (declaredModes && active[e.id].size < modes.length) {
      const partner = elements.find(
        (f) => f.id !== e.id && active[f.id].size < modes.length && disjoint(active[e.id], active[f.id]),
      );
      if (partner) {
        return {
          elementId: e.id,
          name: e.name,
          finding: "exclusive",
          reason: `never runs in the same mode as ${partner.name} — they can share a station`,
        };
      }
    }

    // Free: no gating predecessor, or every predecessor is an early root. The
    // operation can slot into a wide range of stations.
    if (preds.length === 0) {
      return { elementId: e.id, name: e.name, finding: "free", reason: "no precedence — place it wherever there is slack" };
    }
    if (preds.every((p) => rootIds.has(p))) {
      return {
        elementId: e.id,
        name: e.name,
        finding: "free",
        reason: `depends only on an early step (${preds.map((p) => nameOf(elements, p)).join(", ")}) — freely placeable`,
      };
    }

    // Swappable: shares a predecessor with a sibling that is neither its ancestor
    // nor its descendant — either order works.
    const sibling = elements.find((f) => {
      if (f.id === e.id) return false;
      if (anc[e.id]?.has(f.id) || anc[f.id]?.has(e.id)) return false; // ordered against each other
      const fPreds = f.predecessors.filter((p) => ids.has(p));
      return fPreds.some((p) => preds.includes(p));
    });
    if (sibling) {
      return {
        elementId: e.id,
        name: e.name,
        finding: "swappable",
        reason: `shares a predecessor with ${sibling.name} but is not ordered against it — either order works`,
      };
    }

    // Compulsory: a genuine chain link.
    return {
      elementId: e.id,
      name: e.name,
      finding: "compulsory",
      reason: `must follow ${preds.map((p) => nameOf(elements, p)).join(", ")}`,
    };
  });

  const counts: Record<FreedomFinding, number> = { free: 0, swappable: 0, exclusive: 0, compulsory: 0 };
  findings.forEach((f) => counts[f.finding]++);
  return { elements: findings, counts };
}

function disjoint(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  for (const x of a) if (b.has(x)) return false;
  return true;
}
