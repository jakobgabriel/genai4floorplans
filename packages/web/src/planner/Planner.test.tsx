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
    expect(screen.getByText("Actual-state rating")).toBeTruthy();
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
    expect(screen.getByText("Actual-state rating")).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: "Start from the sample cell" }));
    expect(screen.getByText("Actual-state rating")).toBeTruthy();
    // Every earlier stage is reachable again from the stepper.
    fireEvent.click(screen.getByText("Situation"));
    expect(screen.getByRole("heading", { name: "What are you planning?" })).toBeTruthy();
  });
});
