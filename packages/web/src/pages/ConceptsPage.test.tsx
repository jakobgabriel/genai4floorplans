// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { ToastProvider } from "../components/ui";
import { loadConcepts } from "../store/concepts";
import { CONCEPT_DEFAULTS, byKind, rankConcepts } from "@flowplan/core/engine/concepts";
import { generateCandidates } from "@flowplan/core/engine/generate";

function renderApp() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

async function openConcepts() {
  renderApp();
  fireEvent.click(screen.getByText("Manufacturing concepts"));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Manufacturing concepts" })).toBeTruthy());
}

const stored = () => JSON.parse(localStorage.getItem("flowplan_concepts") ?? "null");

/** A concept in the list. Scoped, because "U-cell" is also a form label. */
const listRow = (label: string) =>
  within(document.querySelector(".lib-page__rows") as HTMLElement).getByText(label);

beforeEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  window.location.hash = "";
});
afterEach(cleanup);

// The catalog used to be a frozen TypeScript constant, so the numbers that
// decide the whole comparison were invisible and unchangeable. These tests are
// about that being false now.
describe("the concept catalog is data", () => {
  it("is a destination on the front door, beside the process library", () => {
    renderApp();
    expect(screen.getByText("Manufacturing concepts")).toBeTruthy();
    expect(screen.getByText("Process library")).toBeTruthy();
  });

  it("ships five archetypes rather than starting empty, and says which they are", async () => {
    await openConcepts();
    expect(loadConcepts()).toHaveLength(5);
    ["Job shop", "Manual bench", "U-cell", "Flow line", "Transfer line"].forEach((label) =>
      expect(listRow(label)).toBeTruthy(),
    );
    // Unlike the library, an empty catalog leaves nothing to compare — so the
    // defaults are a visible position, not a hidden constant.
    expect(screen.getByText("As shipped")).toBeTruthy();
  });

  it("shows every assumption behind a ranking, not just the label", async () => {
    await openConcepts();
    fireEvent.click(listRow("U-cell"));
    [
      "Viable from (parts/yr)",
      "Viable to (parts/yr)",
      "Operators per station",
      "Cycle multiplier",
      "Handling share (%)",
      "Capex per station",
      "Power per station (kW)",
      "Changeover (min)",
    ].forEach((label) => expect(screen.getByLabelText(label), label).toBeTruthy());
  });

  it("persists an edit and marks the catalog as no longer the shipped one", async () => {
    await openConcepts();
    fireEvent.click(listRow("U-cell"));
    fireEvent.change(screen.getByLabelText("Capex per station"), { target: { value: "60000" } });
    await waitFor(() => expect(stored().find((c: { kind: string }) => c.kind === "cell").capexPerStation).toBe(60000));
    expect(screen.getByText("Edited")).toBeTruthy();
  });

  it("takes a concept the app has never heard of", async () => {
    await openConcepts();
    fireEvent.change(screen.getByLabelText("New concept"), { target: { value: "Chaku-chaku" } });
    fireEvent.click(within(document.querySelector(".lib-page__tagNew") as HTMLElement).getByRole("button", { name: /^Add/ }));
    await waitFor(() => expect(stored()).toHaveLength(6));
    expect(stored().some((c: { label: string }) => c.label === "Chaku-chaku")).toBe(true);
  });

  it("keeps at least one layout form, because a concept with none generates nothing", async () => {
    await openConcepts();
    fireEvent.click(listRow("Transfer line"));
    const forms = document.querySelector(".lib-page__tagPick") as HTMLElement;
    // Transfer line ships with a single form; turning it off would silently
    // remove the concept from every comparison.
    fireEvent.click(within(forms).getByRole("tab", { name: "Straight line" }));
    await waitFor(() =>
      expect(stored().find((c: { kind: string }) => c.kind === "transfer-line").forms).toEqual(["I"]),
    );
  });

  it("restores the shipped profiles after they are deleted", async () => {
    await openConcepts();
    fireEvent.click(listRow("Job shop"));
    fireEvent.click(screen.getByRole("button", { name: /Delete Job shop/ }));
    await waitFor(() => expect(stored()).toHaveLength(4));
    fireEvent.click(screen.getByRole("button", { name: /Restore defaults/ }));
    await waitFor(() => expect(stored()).toHaveLength(5));
  });
});

// The point of making it data: the engines have to actually read the edited
// catalog, not the shipped one.
describe("the engines read the catalog they are given", () => {
  const steps = [
    { name: "Load", cycleTimeSec: 15 },
    { name: "Press", cycleTimeSec: 30 },
    { name: "Weld", cycleTimeSec: 55 },
  ];
  const brief = { name: "t", steps, annualVolume: 60000, annualShifts: 460, shiftHours: 8, programYears: 5 };

  it("costs a candidate from the profile's capex, not from a constant", () => {
    const dearer = Object.values(CONCEPT_DEFAULTS).map((c) =>
      c.kind === "cell" ? { ...c, capexPerStation: c.capexPerStation * 4 } : c,
    );
    const base = generateCandidates(brief).find((c) => c.id === "cell-U")!;
    const edited = generateCandidates({ ...brief, conceptCatalog: dearer }).find((c) => c.id === "cell-U")!;
    expect(edited.metrics.capexTotal).toBeGreaterThan(base.metrics.capexTotal);
  });

  it("generates a concept the shipped catalog does not contain", () => {
    const withMine = Object.values(CONCEPT_DEFAULTS).concat([
      { ...CONCEPT_DEFAULTS.cell, kind: "chaku", label: "Chaku-chaku", forms: ["U"] },
    ]);
    const ids = generateCandidates({ ...brief, conceptCatalog: withMine }).map((c) => c.id);
    expect(ids).toContain("chaku-U");
  });

  it("scores fit against the band on the profile, so moving the band moves the fit", () => {
    const shifted = Object.values(CONCEPT_DEFAULTS).map((c) =>
      c.kind === "transfer-line" ? { ...c, viableVolume: [1000, 100000] as [number, number] } : c,
    );
    const catalog = byKind(shifted);
    expect(rankConcepts(60000, catalog).find((r) => r.kind === "transfer-line")!.fit).toBe(100);
    expect(rankConcepts(60000).find((r) => r.kind === "transfer-line")!.fit).toBeLessThan(100);
  });

  it("carries the profile on the candidate, so nothing downstream needs the catalog", () => {
    const c = generateCandidates(brief)[0];
    expect(c.profile.kind).toBe(c.concept);
    expect(c.profile.viableVolume).toHaveLength(2);
  });
});
