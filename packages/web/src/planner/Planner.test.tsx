// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { App } from "../App";
import { ToastProvider } from "../components/ui";
import { USE_CASES } from "./usecases";

function renderApp() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

/** Walk the guided flow to the concepts step. */
function toConcepts() {
  fireEvent.click(screen.getByText("Plan a new process"));
  fireEvent.click(screen.getByRole("button", { name: "Continue" })); // demand
  fireEvent.click(screen.getByRole("button", { name: "Continue" })); // process
}

beforeEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  window.location.hash = "";
});
afterEach(cleanup);

describe("planner — entry", () => {
  it("opens on the use case question, not on a rating", () => {
    renderApp();
    expect(screen.getByRole("heading", { name: "What are you planning?" })).toBeTruthy();
    expect(screen.queryByText("Actual-state rating")).toBeNull();
  });

  it("offers every buildable lifecycle case and states what each needs", () => {
    renderApp();
    const ready = USE_CASES.filter((u) => u.availability !== "unavailable");
    ready.forEach((u) => expect(screen.getByText(u.label)).toBeTruthy());
    expect(screen.getAllByText(/You need:/).length).toBe(ready.length);
  });

  it("marks unbuilt and partial cases honestly instead of hiding them", () => {
    renderApp();
    // Unbuilt cases are named and explained, but are no longer choosable tiles
    // competing with the ones that work.
    expect(screen.getByText("Not built yet")).toBeTruthy();
    USE_CASES.filter((u) => u.availability === "unavailable").forEach((u) =>
      expect(screen.getByText(u.label)).toBeTruthy(),
    );
    expect(screen.getByText("Partial")).toBeTruthy();
    expect(screen.getByText(/needs time-series storage/)).toBeTruthy();
  });

  it("asks for the parts on the demand step, before concepts are generated", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a new process"));
    // Single-part by default — listing parts is opt-in, not a form to fill in.
    expect(screen.getByText("Parts this cell will make")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "List the parts" }));
    expect(screen.getByDisplayValue("PN-001")).toBeTruthy();
  });

  it("derives the sizing volume, the program and the mix from the parts", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a new process"));
    fireEvent.click(screen.getByRole("button", { name: "List the parts" }));

    // Part 1: presses, ramping to a peak in year 2.
    fireEvent.change(screen.getByDisplayValue("PN-001"), { target: { value: "A" } });
    fireEvent.change(screen.getByPlaceholderText(/Load 5/), { target: { value: "Load 5 > Press 10" } });
    const yearsOf = (row: number) =>
      [...document.querySelectorAll("tbody tr")][row].querySelectorAll("input");
    fireEvent.change(yearsOf(0)[2], { target: { value: "1000" } });
    fireEvent.change(yearsOf(0)[3], { target: { value: "4000" } });

    // Part 2: welds instead — a different work content, so a second mix.
    fireEvent.click(screen.getByRole("button", { name: "Add a part" }));
    fireEvent.change(screen.getByDisplayValue("PN-002"), { target: { value: "B" } });
    const r1 = yearsOf(1);
    fireEvent.change(r1[1], { target: { value: "Load 5 > Weld 20" } });
    fireEvent.change(yearsOf(1)[2], { target: { value: "1000" } });

    // Sized against year 2 (4000), not year 1 and not an average.
    expect(screen.getByText("Sized for")).toBeTruthy();
    expect(screen.getByText("4,000")).toBeTruthy();
    // Program counts every part and every year: 1000 + 4000 + 1000.
    expect(screen.getByText("6,000")).toBeTruthy();
    // Two distinct routings collapse to two mixes over a three-step union.
    expect(screen.getByText("Distinct mixes")).toBeTruthy();
  });

  it("keeps direct entry points for people who don't want the guided path", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "Open the sample cell" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start blank" })).toBeTruthy();
  });

  it("sends an existing-model case straight to the Refine stage", () => {
    renderApp();
    fireEvent.click(screen.getByText("Improve a planned cell"));
    // Skips demand/process/concepts entirely — that case already has a layout.
    expect(screen.getByRole("tab", { name: "Flow" })).toBeTruthy();
  });
});

describe("planner — guided flow", () => {
  it("asks only demand questions first, and derives takt live", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a new process"));
    expect(screen.getByText("How many, and for how long?")).toBeTruthy();
    // 250,000 / 460 shifts = 543/shift; 8h shift => 53.0s takt
    expect(screen.getByText("543/shift")).toBeTruthy();
    expect(screen.getByText("53.0s")).toBeTruthy();
    expect(screen.getByText("1,250,000 parts")).toBeTruthy();
  });

  it("recomputes the derived figures when volume changes", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a new process"));
    fireEvent.change(screen.getByLabelText("Annual volume (good parts)"), { target: { value: "92000" } });
    expect(screen.getByText("200/shift")).toBeTruthy();
  });

  it("offers an estimate path when cycle times are unknown", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a new process"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.click(screen.getByLabelText("Not yet — estimate from complexity"));
    expect(screen.getByText("These are estimates")).toBeTruthy();
    // 5 steps × 35s moderate default
    expect(screen.getByText(/5 steps · 175s total work content/)).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Complex —/));
    expect(screen.getByText(/5 steps · 300s total work content/)).toBeTruthy();
  });

  it("blocks Continue when there are no steps", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a new process"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.change(screen.getByLabelText("Process steps"), { target: { value: "" } });
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("ranks concepts by fully loaded cost, showing the capex split", () => {
    renderApp();
    toConcepts();
    expect(screen.getByText("Which concept?")).toBeTruthy();
    expect(screen.getByText(/fully\s+loaded/)).toBeTruthy();
    // Each row breaks the number into operating + amortised capex.
    expect(screen.getAllByText(/run \+ .* capex/).length).toBeGreaterThan(3);
  });

  it("tags options that miss demand or sit off their volume band", () => {
    renderApp();
    toConcepts();
    const tags = document.body.textContent ?? "";
    expect(/Off-volume|Misses demand|% capacity/.test(tags)).toBe(true);
  });

  it("continues from Concepts into the Refine stage, which is the editor", () => {
    renderApp();
    toConcepts();
    fireEvent.click(screen.getByRole("button", { name: "Refine this layout" }));
    // The editor is a stage of the process, not a separate destination.
    expect(screen.getByRole("tab", { name: "Flow" })).toBeTruthy();
    // ...and the process stepper is still present around it.
    expect(screen.getByText("Refine")).toBeTruthy();
    expect(screen.getByText("Summary")).toBeTruthy();
  });

  it("reaches the Summary stage after refining", () => {
    renderApp();
    toConcepts();
    fireEvent.click(screen.getByRole("button", { name: "Refine this layout" }));
    // The editor has a forward exit, not just an entrance.
    fireEvent.click(screen.getByRole("button", { name: "Continue to summary" }));
    expect(screen.getByText("This is a starting point, not a plan")).toBeTruthy();
    expect(screen.getByText("Loaded cost/part")).toBeTruthy();
  });

  it("Back from the first step returns to the use case picker", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a new process"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "What are you planning?" })).toBeTruthy();
  });

  it("keeps the stepper available from inside the editor", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Open the sample cell" }));
    expect(screen.getByRole("tab", { name: "Flow" })).toBeTruthy();
    // Every earlier stage is reachable again from the stepper.
    fireEvent.click(screen.getByText("Situation"));
    expect(screen.getByRole("heading", { name: "What are you planning?" })).toBeTruthy();
  });
});
