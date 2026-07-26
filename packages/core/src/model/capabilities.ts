// Governed capability catalog (spec §12, audit C-01). A cell needs
// CAPABILITIES; resources PROVIDE them. The N:M relation — and specifically a
// capability's `alternatives` — is what lets the tool GENERATE concept variants
// (§7) instead of recording a single 1:1 process→workcenter link (Excel's F3).
//
// This is the minimal governed layer the parked portfolio code (§18 Gate 1)
// needed to unpark: a stable id space with names, categories and substitutions,
// separate from the keyword-inference hints in engine/infer.ts.

export type CapabilityCategory =
  | "join"
  | "form"
  | "cut"
  | "inspect"
  | "handle"
  | "mark"
  | "test"
  | "transport"
  | "surface";

export interface Capability {
  id: string;
  name: string;
  category: CapabilityCategory;
  /** Capabilities that can substitute for this one — the N:M substitution that
   *  generates concept variants (§7). Weld vs. bolt, visual vs. functional test. */
  alternatives?: string[];
  /** Effective-dating so a released cell reconstructs against the catalog state
   *  at its release (spec §6/§12). Absent ⇒ always effective. */
  effectiveFrom?: string;
  effectiveTo?: string;
}

/** The seeded catalog, keyed to the ids engine/infer.ts already emits, so an
 *  inferred workload and a generated cell speak the same capability id space. */
export const DEFAULT_CAPABILITIES: Capability[] = [
  { id: "cut.machining", name: "Machining", category: "cut" },
  { id: "form.press", name: "Pressing / forming", category: "form" },
  { id: "join.weld", name: "Welding", category: "join", alternatives: ["join.assemble"] },
  { id: "join.assemble", name: "Mechanical assembly", category: "join", alternatives: ["join.weld"] },
  { id: "inspect.visual", name: "Visual inspection", category: "inspect", alternatives: ["test.function"] },
  { id: "test.function", name: "Functional test", category: "test", alternatives: ["inspect.visual"] },
  { id: "surface.finish", name: "Surface finishing", category: "surface" },
  { id: "mark.identify", name: "Marking / identification", category: "mark" },
  { id: "handle.load", name: "Load / unload handling", category: "handle" },
  { id: "handle.pack", name: "Packing", category: "handle" },
  { id: "transport.move", name: "Transport", category: "transport" },
];

/** The catalog to use for a model: its own governed list if it carries one,
 *  otherwise the seeded default. Keeps offline/first-launch working (§1.1). */
export function catalogFor(model: { capabilities?: Capability[] }): Capability[] {
  return model.capabilities && model.capabilities.length > 0 ? model.capabilities : DEFAULT_CAPABILITIES;
}

/** Index a catalog by id for quick lookup. */
export function capabilityIndex(catalog: Capability[]): Map<string, Capability> {
  return new Map(catalog.map((c) => [c.id, c]));
}
