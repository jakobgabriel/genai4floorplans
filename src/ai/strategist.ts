import type { Model, Station } from "../model/types";
import { modelReducer, type ModelAction } from "../store/reducer";
import { optimize } from "../engine/optimize";
import type { CellForm } from "../engine/templates";
import { clampToGrid, hasCollision } from "../engine/geometry";
import { normalizeFlow, normalizeModel, normalizeStation } from "../model/defaults";
import type { AiProvider, EditResult, Proposal, ProposalContext } from "./types";
import { dedupeProposals, makeProposal } from "./verify";

function byId(model: Model): Record<string, Station> {
  const m: Record<string, Station> = {};
  model.stations.forEach((s) => (m[s.id] = s));
  return m;
}

/** Topological-ish order of station ids following the flow graph. */
function flowOrder(model: Model): string[] {
  const ids = model.stations.map((s) => s.id);
  const indeg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  ids.forEach((i) => {
    indeg[i] = 0;
    adj[i] = [];
  });
  model.flows.forEach((f) => {
    if (indeg[f.to] != null && adj[f.from]) {
      adj[f.from].push(f.to);
      indeg[f.to]++;
    }
  });
  const q = ids.filter((i) => indeg[i] === 0);
  const order: string[] = [];
  const seen = new Set<string>();
  while (q.length) {
    const n = q.shift() as string;
    if (seen.has(n)) continue;
    seen.add(n);
    order.push(n);
    adj[n].forEach((m) => {
      indeg[m]--;
      if (indeg[m] <= 0) q.push(m);
    });
  }
  ids.forEach((i) => {
    if (!seen.has(i)) order.push(i);
  });
  return order;
}

// ---- candidate builders --------------------------------------------------

function optimizerFloor(model: Model): Model {
  const grid = { gridW: model.gridW, gridH: model.gridH, noGoZones: model.noGoZones };
  return { ...model, stations: optimize(model.stations, model.flows, grid, { restarts: 8 }) };
}

function bestCellForm(model: Model): { model: Model; form: CellForm } | null {
  const forms: CellForm[] = ["I", "U", "L", "S"];
  let best: Model | null = null;
  let bestForm: CellForm = "I";
  let bestCost = Infinity;
  for (const form of forms) {
    const cand = modelReducer(model, { type: "APPLY_TEMPLATE", form });
    // cheap proxy: total rectilinear flow distance
    const id = byId(cand);
    let cost = 0;
    cand.flows.forEach((f) => {
      const a = id[f.from];
      const b = id[f.to];
      if (a && b) cost += f.volume * (Math.abs(a.x - b.x) + Math.abs(a.y - b.y));
    });
    if (cost < bestCost) {
      bestCost = cost;
      best = cand;
      bestForm = form;
    }
  }
  return best ? { model: best, form: bestForm } : null;
}

function groupByFlow(model: Model): Model {
  const order = flowOrder(model);
  const id = byId(model);
  const movable = order.filter((i) => id[i] && id[i].role === "process" && !id[i].fixed);
  const stations = model.stations.map((s) => ({ ...s }));
  const idx: Record<string, number> = {};
  stations.forEach((s, i) => (idx[s.id] = i));
  const midY = Math.max(0, Math.round(model.gridH / 2 - 1));
  let cursor = 1;
  movable.forEach((sid) => {
    const s = stations[idx[sid]];
    const p = clampToGrid(s, cursor, midY, model.gridW, model.gridH);
    stations[idx[sid]] = { ...s, x: p.x, y: p.y };
    cursor = p.x + s.w + 1;
  });
  return { ...model, stations };
}

function chainIslands(model: Model, ctx: ProposalContext): Model | null {
  const islandPairs = ctx.chain.links.filter((l) => l.kind === "auto-island");
  if (islandPairs.length === 0) return null;
  const keys = new Set(islandPairs.map((l) => l.from + ">" + l.to));
  const flows = model.flows.map((f) => (keys.has(f.from + ">" + f.to) ? { ...f, transport: "conveyor" as const } : f));
  return { ...model, flows };
}

function addParallelLane(model: Model, ctx: ProposalContext): Model | null {
  const bn = ctx.rating.balance.bottleneck;
  if (!bn) return null;
  return {
    ...model,
    stations: model.stations.map((s) => (s.id === bn.id ? { ...s, parallelUnits: Math.max(1, s.parallelUnits ?? 1) + 1 } : s)),
  };
}

// ---- NL editing helpers --------------------------------------------------

function findStation(model: Model, term: string): Station | undefined {
  const t = term.trim().toLowerCase();
  if (!t) return undefined;
  return (
    model.stations.find((s) => s.id.toLowerCase() === t || s.name.toLowerCase() === t) ||
    model.stations.find((s) => s.name.toLowerCase().includes(t) || s.id.toLowerCase().includes(t))
  );
}

function adjacentFreePosition(model: Model, mover: Station, anchor: Station): { x: number; y: number } {
  const candidates = [
    { x: anchor.x + anchor.w + 1, y: anchor.y },
    { x: anchor.x - mover.w - 1, y: anchor.y },
    { x: anchor.x, y: anchor.y + anchor.h + 1 },
    { x: anchor.x, y: anchor.y - mover.h - 1 },
  ];
  for (const c of candidates) {
    const p = clampToGrid(mover, c.x, c.y, model.gridW, model.gridH);
    if (!hasCollision(mover, p.x, p.y, model.stations, model.noGoZones)) return p;
  }
  return clampToGrid(mover, anchor.x + anchor.w + 1, anchor.y, model.gridW, model.gridH);
}

// ---- ingest helpers ------------------------------------------------------

function splitRows(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(/\t|,|;/).map((c) => c.trim()))
    .filter((r) => r.some((c) => c.length > 0));
}

// ============================ provider ====================================

export const strategist: AiProvider = {
  name: "Offline strategist",

  async propose(ctx: ProposalContext): Promise<Proposal[]> {
    const { model, rating } = ctx;
    const drafts: Array<Parameters<typeof makeProposal>[2]> = [];

    drafts.push({
      strategy: "optimizer",
      title: "Optimizer floor (multi-restart)",
      rationale:
        "Greedy pairwise swaps with 8 randomized restarts, respecting fixed stations and no-go zones. The achievable floor for repositioning alone.",
      model: optimizerFloor(model),
    });

    const cf = bestCellForm(model);
    if (cf)
      drafts.push({
        strategy: "cell-form",
        title: `Re-form as a ${cf.form}-cell`,
        rationale: `Arranging the movable process steps as a ${cf.form}-shaped cell shortens the dominant material path.`,
        model: cf.model,
      });

    drafts.push({
      strategy: "group-by-flow",
      title: "Sequence steps by flow",
      rationale:
        "Lay the movable process steps left-to-right in the order material actually visits them, eliminating backtracking along the line.",
      model: groupByFlow(model),
    });

    const ci = chainIslands(model, ctx);
    if (ci)
      drafts.push({
        strategy: "chain-automation",
        title: "Chain the automation islands",
        rationale:
          "Two automated steps are joined by a manual handoff. Switching those handoffs to a conveyor closes the island and lifts automation coherence.",
        model: ci,
      });

    const rb = addParallelLane(model, ctx);
    if (rb && rating.balance.bottleneck)
      drafts.push({
        strategy: "parallel-lane",
        title: `Add a parallel lane at ${rating.balance.bottleneck.name}`,
        rationale:
          "The constraint caps line output. Running an extra identical lane in parallel multiplies its capacity and lifts the whole line's throughput.",
        model: rb,
      });

    const proposals = drafts
      .map((d) => makeProposal(rating, model, d))
      .filter((p): p is Proposal => p !== null);
    return dedupeProposals(proposals, model).sort((a, b) => b.deltas.composite - a.deltas.composite);
  },

  async narrate(ctx: ProposalContext): Promise<string> {
    const { rating, chain, validation } = ctx;
    const s = rating.scores;
    const entries: Array<[string, number]> = [
      ["material flow cost", s.flowCost],
      ["travel effort", s.travel],
      ["aisle congestion", s.congestion],
      ["line balance", s.balance],
      ["ergonomics", s.ergo],
      ["automation coherence", s.auto],
    ];
    const weakest = entries.slice().sort((a, b) => a[1] - b[1])[0];
    const bn = rating.balance.bottleneck;
    const parts: string[] = [];
    parts.push(
      `This cell grades ${rating.letter} (${rating.composite.toFixed(0)}/100). The weakest dimension is ${weakest[0]} at ${weakest[1].toFixed(0)}/100.`,
    );
    if (bn)
      parts.push(
        `Throughput is constrained by ${bn.name} at ${bn.cycle}s/part, capping the line at ${rating.balance.lineOut.toLocaleString()} parts/shift (takt ≈ ${rating.balance.takt}s).`,
      );
    if (rating.flowReductionPct >= 1)
      parts.push(`Repositioning movable stations alone could cut material-flow cost by about ${rating.flowReductionPct.toFixed(0)}%.`);
    if (chain.islands > 0)
      parts.push(`${chain.islands} automation island(s) waste two automated steps on a manual handoff — prime to chain.`);
    if (!validation.valid) parts.push(`Note: the process flow has blocking issues that should be fixed before trusting the rating.`);
    parts.push(`Open the Copilot proposals for scored layouts that target these weaknesses.`);
    return parts.join(" ");
  },

  async edit(ctx: ProposalContext, instruction: string): Promise<EditResult> {
    const model = ctx.model;
    const text = instruction.trim();
    const lower = text.toLowerCase();
    const actions: ModelAction[] = [];

    let m: RegExpMatchArray | null;

    if ((m = lower.match(/\b(?:make|turn).*\b([iuls])[- ]?(?:shape|cell|line)?\b/)) || (m = lower.match(/\bline (?:into )?(?:a )?([iuls])\b/))) {
      const form = m[1].toUpperCase() as CellForm;
      actions.push({ type: "APPLY_TEMPLATE", form });
      return { actions, summary: `Re-formed the movable steps as a ${form}-cell.` };
    }

    if ((m = text.match(/move\s+(.+?)\s+(?:next to|beside|near)\s+(.+)/i))) {
      const mover = findStation(model, m[1]);
      const anchor = findStation(model, m[2]);
      if (!mover || !anchor) return { actions: [], summary: "", unresolved: `Couldn't find ${!mover ? m[1] : m[2]}.` };
      const p = adjacentFreePosition(model, mover, anchor);
      actions.push({ type: "MOVE_STATION", id: mover.id, x: p.x, y: p.y });
      return { actions, summary: `Moved ${mover.name} next to ${anchor.name}.` };
    }

    if ((m = text.match(/(?:connect|link|add (?:a )?flow (?:from )?)\s*(.+?)\s+(?:to|->|→)\s+(.+)/i))) {
      const a = findStation(model, m[1]);
      const b = findStation(model, m[2]);
      if (!a || !b) return { actions: [], summary: "", unresolved: `Couldn't find ${!a ? m[1] : m[2]}.` };
      actions.push({ type: "ADD_FLOW", from: a.id, to: b.id });
      return { actions, summary: `Added flow ${a.name} → ${b.name}.` };
    }

    if ((m = text.match(/(?:automate|automation (?:for )?)\s*(.+)/i)) && /automat/i.test(lower)) {
      const s = findStation(model, m[1]);
      if (!s) return { actions: [], summary: "", unresolved: `Couldn't find ${m[1]}.` };
      actions.push({ type: "UPDATE_STATION", id: s.id, patch: { auto: "auto", autoOverride: "yes" } });
      return { actions, summary: `Marked ${s.name} as automated.` };
    }

    if ((m = text.match(/(?:anchor|fix|pin)\s+(.+)/i))) {
      const s = findStation(model, m[1]);
      if (!s) return { actions: [], summary: "", unresolved: `Couldn't find ${m[1]}.` };
      actions.push({ type: "UPDATE_STATION", id: s.id, patch: { fixed: true } });
      return { actions, summary: `Anchored ${s.name}.` };
    }

    if ((m = text.match(/(?:unfix|unanchor|free|release|unpin)\s+(.+)/i))) {
      const s = findStation(model, m[1]);
      if (!s) return { actions: [], summary: "", unresolved: `Couldn't find ${m[1]}.` };
      actions.push({ type: "UPDATE_STATION", id: s.id, patch: { fixed: false } });
      return { actions, summary: `Made ${s.name} movable.` };
    }

    if ((m = text.match(/(?:delete|remove)\s+(.+)/i))) {
      const s = findStation(model, m[1]);
      if (!s) return { actions: [], summary: "", unresolved: `Couldn't find ${m[1]}.` };
      actions.push({ type: "DELETE_STATION", id: s.id });
      return { actions, summary: `Deleted ${s.name}.` };
    }

    if ((m = text.match(/rename\s+(.+?)\s+to\s+(.+)/i))) {
      const s = findStation(model, m[1]);
      if (!s) return { actions: [], summary: "", unresolved: `Couldn't find ${m[1]}.` };
      actions.push({ type: "UPDATE_STATION", id: s.id, patch: { name: m[2].trim() } });
      return { actions, summary: `Renamed ${s.name} to “${m[2].trim()}”.` };
    }

    return {
      actions: [],
      summary: "",
      unresolved:
        'Try: "make the line a U", "move QA next to Assembly", "connect Press to QA", "automate CNC", "anchor Press", or "rename CNC to Lathe".',
    };
  },

  async ingest(text: string): Promise<Model> {
    const rows = splitRows(text);
    if (rows.length === 0) throw new Error("No rows found.");
    // Detect a header row by looking for known column names.
    const headerCandidate = rows[0].map((c) => c.toLowerCase());
    const known = ["name", "step", "station", "cycle", "operators", "capacity", "type", "role", "auto", "to", "next", "volume"];
    const hasHeader = headerCandidate.some((c) => known.some((k) => c.includes(k)));
    const header = hasHeader ? headerCandidate : [];
    const body = hasHeader ? rows.slice(1) : rows;
    const col = (names: string[]) => {
      const exact = header.findIndex((h) => names.includes(h));
      return exact >= 0 ? exact : header.findIndex((h) => names.some((n) => h.includes(n)));
    };
    const ci = {
      name: col(["name", "step", "station"]),
      cycle: col(["cycle"]),
      operators: col(["operator"]),
      capacity: col(["capacity"]),
      type: col(["type"]),
      role: col(["role"]),
      auto: col(["auto"]),
      to: col(["to", "next"]),
      volume: col(["volume"]),
    };

    const stations = body.map((r, i) => {
      const name = (ci.name >= 0 ? r[ci.name] : r[0]) || `Step ${i + 1}`;
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `step_${i + 1}`;
      const num = (idx: number, d: number) => (idx >= 0 && r[idx] && !isNaN(+r[idx]) ? +r[idx] : d);
      return {
        id,
        name,
        role: (ci.role >= 0 ? r[ci.role] : "process") as Station["role"],
        type: (ci.type >= 0 ? r[ci.type] : "machine") as Station["type"],
        cycleTimeSec: num(ci.cycle, 30),
        operators: num(ci.operators, 1),
        capacityPerShift: num(ci.capacity, 1000),
        auto: (ci.auto >= 0 ? r[ci.auto] : "manual") as Station["auto"],
      };
    });
    // Default I-line layout in flow order.
    const ids = stations.map((s) => s.id);
    if (ids.length) {
      // first/last become I/O when roles weren't supplied.
      if (ci.role < 0) {
        stations[0].role = "input";
        stations[stations.length - 1].role = "output";
      }
    }
    const flows: Array<{ from: string; to: string; volume: number }> = [];
    if (ci.to >= 0) {
      body.forEach((r, i) => {
        const target = r[ci.to];
        const ts = stations.find((s) => s.name.toLowerCase() === (target || "").toLowerCase() || s.id === target);
        if (ts) flows.push({ from: stations[i].id, to: ts.id, volume: ci.volume >= 0 ? +r[ci.volume] || 1000 : 1000 });
      });
    } else {
      for (let i = 0; i < stations.length - 1; i++) flows.push({ from: stations[i].id, to: stations[i + 1].id, volume: 1000 });
    }

    const model = normalizeModel({
      name: "Imported routing",
      stations: stations.map(normalizeStation),
      flows: flows.map(normalizeFlow),
    });
    // Lay out along the centerline.
    return groupByFlow(model);
  },
};
