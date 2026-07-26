import { describe, it, expect } from "vitest";
import type { VariantMode, WorkElement } from "../model/types";
import { makeWorkElement } from "./workload";
import { classifyFreedom } from "./freedom";

const el = (id: string, preds: string[] = []): WorkElement => ({
  ...makeWorkElement(id, id.toUpperCase(), 10),
  predecessors: preds,
});

const mode = (id: string, overrides: Record<string, number>): VariantMode => ({
  id,
  name: id,
  share: 0.5,
  elementOverrides: overrides,
});

describe("freedom-finding (blueprint §4.8)", () => {
  it("a root operation is free — placeable wherever there is slack", () => {
    const r = classifyFreedom([el("a"), el("b", ["a"])]);
    expect(r.elements.find((e) => e.elementId === "a")?.finding).toBe("free");
  });

  it("an operation that depends only on an early root is free", () => {
    // a is root; b and c both depend only on a.
    const r = classifyFreedom([el("a"), el("b", ["a"]), el("c", ["a"])]);
    const b = r.elements.find((e) => e.elementId === "b");
    expect(b?.finding).toBe("free");
  });

  it("a genuine chain link is compulsory", () => {
    // a -> b -> c ; c depends on non-root b.
    const r = classifyFreedom([el("a"), el("b", ["a"]), el("c", ["b"])]);
    expect(r.elements.find((e) => e.elementId === "c")?.finding).toBe("compulsory");
  });

  it("siblings sharing a non-root predecessor are swappable", () => {
    // a -> b ; b -> c and b -> d. c and d share predecessor b, unordered.
    const r = classifyFreedom([el("a"), el("b", ["a"]), el("c", ["b"]), el("d", ["b"])]);
    expect(r.elements.find((e) => e.elementId === "c")?.finding).toBe("swappable");
    expect(r.elements.find((e) => e.elementId === "d")?.finding).toBe("swappable");
  });

  it("elements skipped in complementary modes are exclusive", () => {
    // x active only in mode A, y active only in mode B — never co-occur.
    const els = [el("base"), el("x", ["base"]), el("y", ["base"])];
    const modes = [mode("A", { y: 0 }), mode("B", { x: 0 })];
    const r = classifyFreedom(els, modes);
    expect(r.elements.find((e) => e.elementId === "x")?.finding).toBe("exclusive");
    expect(r.elements.find((e) => e.elementId === "y")?.finding).toBe("exclusive");
  });

  it("counts add up to the element total", () => {
    const r = classifyFreedom([el("a"), el("b", ["a"]), el("c", ["b"])]);
    const total = r.counts.free + r.counts.swappable + r.counts.exclusive + r.counts.compulsory;
    expect(total).toBe(3);
  });
});
