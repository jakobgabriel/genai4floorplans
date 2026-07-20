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

  it("offers every lifecycle case and states what each needs", () => {
    renderApp();
    USE_CASES.forEach((u) => expect(screen.getByText(u.label)).toBeTruthy());
    expect(screen.getAllByText(/You need:/).length).toBe(USE_CASES.length);
  });

  it("marks unbuilt and partial cases honestly instead of hiding them", () => {
    renderApp();
    expect(screen.getByText("Not built")).toBeTruthy();
    expect(screen.getByText("Partial")).toBeTruthy();
    expect(screen.getByText(/needs time-series storage/)).toBeTruthy();
  });

  it("keeps direct entry points for people who don't want the guided path", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "Start from the sample cell" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start blank" })).toBeTruthy();
  });

  it("sends an existing-model case straight to the Refine stage", () => {
    renderApp();
    fireEvent.click(screen.getByText("Improve a planned cell"));
    // Skips demand/process/concepts entirely — that case already has a layout.
    // The editor (inputs-only rail) is shown; the view toggle is always present.
    expect(screen.getByRole("button", { name: "Actual" })).toBeTruthy();
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

  it("presents the seeded steps as an editable, data-model-faithful table", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a new process"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // → process
    expect(screen.getByText("What are the process steps?")).toBeTruthy();
    // The five seeded steps are editable text fields, not a paste box.
    expect(screen.getByDisplayValue("Weld")).toBeTruthy();
    expect(screen.getByDisplayValue("Leak test")).toBeTruthy();
    // A live rollup reports content and how much is still inferred.
    expect(screen.getByText(/5 steps · .*s total work content · .*value-add/)).toBeTruthy();
  });

  it("adds a step and lets you pin its cycle time", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a new process"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" })); // → process
    fireEvent.click(screen.getByRole("button", { name: /Add a step/ }));
    expect(screen.getByText(/6 steps/)).toBeTruthy();
    // Continue stays enabled — there are steps.
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(false);
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
    expect(screen.getByRole("button", { name: "Actual" })).toBeTruthy();
    // ...with a forward exit to the Summary.
    expect(screen.getByRole("button", { name: "Continue to summary" })).toBeTruthy();
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

  it("runs the editor full-screen, without the planning stepper", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Start from the sample cell" }));
    expect(screen.getByRole("button", { name: "Actual" })).toBeTruthy();
    // The node-RED editor is chromeless: the planning stepper is hidden so the
    // canvas fills the viewport between the two rails.
    expect(document.querySelector(".shell__steps")).toBeNull();
    expect(document.querySelector(".shell--editor")).toBeTruthy();
  });
});
