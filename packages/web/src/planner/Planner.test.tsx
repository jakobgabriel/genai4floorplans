// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { App } from "../App";
import { ToastProvider } from "../components/ui";

function renderApp() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

/** The inputs of one part row: part number, routing, then one per program year. */
function row(i: number): HTMLInputElement[] {
  return [...[...document.querySelectorAll("tbody tr")][i].querySelectorAll("input")] as HTMLInputElement[];
}

/** Give the seeded row a routing and a demand — the precondition for Continue. */
function fillFirstPart(routing = "Load 5 > Press 10", year1 = "1000") {
  const cells = row(0);
  fireEvent.change(cells[1], { target: { value: routing } });
  fireEvent.change(cells[2], { target: { value: year1 } });
}

/** Walk the guided flow from the start screen to the concepts stage. */
function toConcepts() {
  fireEvent.click(screen.getByRole("button", { name: "Plan a new cell" }));
  fillFirstPart();
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

beforeEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  window.location.hash = "";
});
afterEach(cleanup);

describe("planner — entry", () => {
  it("opens on the two things you can do, not on a rating", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "Plan a new cell" })).toBeTruthy();
    expect(screen.queryByText("Actual-state rating")).toBeNull();
    // No stepper before there is anything to step through.
    expect(screen.queryByText("Parts & demand")).toBeNull();
  });

  it("keeps direct entry points for people who don't want the guided path", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "Open the sample cell" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start blank" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import a JSON model" })).toBeTruthy();
  });

  it("names what is not built instead of offering it as a choice", () => {
    renderApp();
    expect(screen.getByText("Not built yet")).toBeTruthy();
    expect(screen.getByText("Monitor serial production")).toBeTruthy();
    expect(screen.getByText(/needs time-series storage/)).toBeTruthy();
  });

  it("opens the sample cell straight into the editor", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Open the sample cell" }));
    expect(screen.getByRole("tab", { name: "Flow" })).toBeTruthy();
  });
});

describe("planner — parts & demand", () => {
  it("asks for the parts first, with one row already there to fill in", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Plan a new cell" }));
    expect(screen.getByRole("heading", { name: "What does this cell make?" })).toBeTruthy();
    // The matrix is the input, not an opt-in: a row is present on arrival.
    expect(screen.getByDisplayValue("PN-001")).toBeTruthy();
  });

  it("blocks Continue until a part carries both a routing and a demand", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Plan a new cell" }));
    const cont = () => screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(cont().disabled).toBe(true);

    fireEvent.change(row(0)[1], { target: { value: "Load 5 > Press 10" } });
    expect(cont().disabled).toBe(true); // routing but no demand

    fireEvent.change(row(0)[2], { target: { value: "1000" } });
    expect(cont().disabled).toBe(false);
  });

  it("derives the sizing volume, the program and the mix from the parts", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Plan a new cell" }));

    // Part 1: presses, ramping to a peak in year 2.
    fireEvent.change(screen.getByDisplayValue("PN-001"), { target: { value: "A" } });
    fireEvent.change(row(0)[1], { target: { value: "Load 5 > Press 10" } });
    fireEvent.change(row(0)[2], { target: { value: "1000" } });
    fireEvent.change(row(0)[3], { target: { value: "4000" } });

    // Part 2: welds instead — a different work content, so a second mix.
    fireEvent.click(screen.getByRole("button", { name: "Add a part" }));
    fireEvent.change(screen.getByDisplayValue("PN-002"), { target: { value: "B" } });
    fireEvent.change(row(1)[1], { target: { value: "Load 5 > Weld 20" } });
    fireEvent.change(row(1)[2], { target: { value: "1000" } });

    // Sized against year 2 (4000), not year 1 and not an average.
    expect(screen.getByText("Sized for")).toBeTruthy();
    expect(screen.getByText("4,000")).toBeTruthy();
    // Program counts every part and every year: 1000 + 4000 + 1000.
    expect(screen.getByText("6,000")).toBeTruthy();
    expect(screen.getByText("Distinct mixes")).toBeTruthy();
  });

  it("shows the union routing and what was inferred from it, without a Process step", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Plan a new cell" }));
    fillFirstPart("Load 5 > Press 10 > Weld 20");
    // What the old Process step previewed now reads under the parts that produced it.
    expect(screen.getByText(/3 steps · 35s total work content/)).toBeTruthy();
    expect(screen.getByLabelText("Inferred work elements")).toBeTruthy();
    expect(screen.getByText("Everything but the names was inferred")).toBeTruthy();
  });

  it("adds and removes demand years from the table itself, past the old cap of ten", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Plan a new cell" }));
    const yearCols = () => document.querySelectorAll("thead th.parts__num").length;
    expect(yearCols()).toBe(5);

    const more = screen.getByRole("button", { name: /One year more/ });
    for (let i = 0; i < 8; i++) fireEvent.click(more);
    // The column count used to be min(years, 10), so 13 years showed 10 and the
    // last three could not be entered at all.
    expect(yearCols()).toBe(13);
    expect(screen.getByText("13 program years")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /One year fewer/ }));
    expect(yearCols()).toBe(12);
  });

  it("counts demand in every year it shows, and only those", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Plan a new cell" }));
    fireEvent.change(row(0)[1], { target: { value: "Press 10" } });
    fireEvent.change(row(0)[2], { target: { value: "1000" } });
    fireEvent.change(row(0)[6], { target: { value: "9000" } }); // year 5

    expect(screen.getByText("10,000")).toBeTruthy(); // program total
    // Shortening the program drops the years it hides rather than letting them
    // keep counting toward the volume that amortises capex.
    fireEvent.click(screen.getByRole("button", { name: /One year fewer/ }));
    expect(screen.queryByText("10,000")).toBeNull();
    // Peak and program are both the surviving year's 1,000.
    expect(screen.getAllByText("1,000").length).toBe(2);
  });

  it("Back from the first stage returns to the start screen", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Plan a new cell" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Plan a new cell" })).toBeTruthy();
  });
});

describe("planner — guided flow", () => {
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

  it("keeps the stepper available from inside the editor", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Open the sample cell" }));
    expect(screen.getByRole("tab", { name: "Flow" })).toBeTruthy();
    // Every earlier stage is reachable again from the stepper.
    fireEvent.click(screen.getByText("Parts & demand"));
    expect(screen.getByRole("heading", { name: "What does this cell make?" })).toBeTruthy();
  });

  it("runs in four stages, not six", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Open the sample cell" }));
    ["Parts & demand", "Concepts", "Refine", "Summary"].forEach((s) =>
      expect(screen.getByText(s)).toBeTruthy(),
    );
    expect(screen.queryByText("Situation")).toBeNull();
    expect(screen.queryByText("Process")).toBeNull();
  });
});
