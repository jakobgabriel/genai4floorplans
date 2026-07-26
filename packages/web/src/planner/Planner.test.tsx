// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { App } from "../App";
import { ToastProvider } from "../components/ui";
import { fromCapabilities } from "@flowplan/core/model/library";
import { CAPABILITY_HINTS } from "@flowplan/core/engine/infer";

function renderApp() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

/** The library starts empty and nothing is seeded, so a test that needs one
 *  puts it there — the same import the empty state offers. */
function seedLibrary() {
  const processes = fromCapabilities(CAPABILITY_HINTS.map((h) => ({ capabilityId: h.capabilityId, label: (h.capabilityId.split(".").pop() ?? h.capabilityId) })), (i) => "lib_" + i);
  localStorage.setItem("flowplan_process_library", JSON.stringify({ processes, tags: [] }));
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
  fireEvent.click(screen.getByText("Plan a cell"));
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
    expect(screen.getByText("Plan a cell")).toBeTruthy();
    expect(screen.queryByText("Actual-state rating")).toBeNull();
    // No stepper before there is anything to step through.
    expect(screen.queryByText("Parts & demand")).toBeNull();
  });

  it("keeps direct entry points for people who don't want the guided path", () => {
    renderApp();
    expect(screen.getByText("See an example")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start blank" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import a JSON model" })).toBeTruthy();
  });

  it("states what is not implemented rather than offering it as a choice", () => {
    renderApp();
    expect(screen.getByText(/Serial-production monitoring is not implemented/)).toBeTruthy();
  });

  it("opens the sample cell straight into the editor", () => {
    renderApp();
    fireEvent.click(screen.getByText("See an example"));
    expect(screen.getByRole("tab", { name: "Flow" })).toBeTruthy();
  });
});

describe("planner — parts & demand", () => {
  it("asks for the parts first, with one row already there to fill in", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a cell"));
    expect(screen.getByRole("heading", { name: "Parts & demand" })).toBeTruthy();
    // The matrix is the input, not an opt-in: a row is present on arrival.
    expect(screen.getByDisplayValue("PN-001")).toBeTruthy();
  });

  it("blocks Continue until a part carries both a routing and a demand", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a cell"));
    const cont = () => screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(cont().disabled).toBe(true);

    fireEvent.change(row(0)[1], { target: { value: "Load 5 > Press 10" } });
    expect(cont().disabled).toBe(true); // routing but no demand

    fireEvent.change(row(0)[2], { target: { value: "1000" } });
    expect(cont().disabled).toBe(false);
  });

  it("derives the sizing volume, the program and the mix from the parts", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a cell"));

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
    fireEvent.click(screen.getByText("Plan a cell"));
    fillFirstPart("Load 5 > Press 10 > Weld 20");
    // What the old Process step previewed now reads under the parts that produced it.
    expect(screen.getByText(/3 steps · 35s total work content/)).toBeTruthy();
    expect(screen.getByLabelText("Inferred work elements")).toBeTruthy();
    expect(screen.getByText("Inferred fields")).toBeTruthy();
  });

  it("adds and removes demand years from the table itself, past the old cap of ten", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a cell"));
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
    fireEvent.click(screen.getByText("Plan a cell"));
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

  it("says so, rather than showing an empty list, when the library has nothing in it", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a cell"));
    fireEvent.click(screen.getByRole("button", { name: /Build PN-001's routing from the library/ }));
    const pick = document.querySelector(".parts__picker") as HTMLElement;
    expect(within(pick).getByText(/library is empty/)).toBeTruthy();
    expect(within(pick).getByRole("button", { name: "Open the library" })).toBeTruthy();
  });

  it("builds a routing from the process library instead of typing it", () => {
    seedLibrary();
    renderApp();
    fireEvent.click(screen.getByText("Plan a cell"));
    fireEvent.click(screen.getByRole("button", { name: /Build PN-001's routing from the library/ }));

    const pick = document.querySelector(".parts__picker") as HTMLElement;
    // Each library process is an "Add — <name>" button; clicking one appends it
    // to the part's routing. (Names come from the seeded capability catalog, so
    // assert the mechanism, not a specific process name.)
    const addButtons = within(pick).getAllByRole("button", { name: /^Add — / });
    expect(addButtons.length).toBeGreaterThan(1);
    fireEvent.click(addButtons[0]);
    const afterOne = row(0)[1].value;
    expect(afterOne.length).toBeGreaterThan(0);
    fireEvent.click(addButtons[1]);
    // A second pick extends the routing past the first.
    expect(row(0)[1].value.length).toBeGreaterThan(afterOne.length);
    expect(row(0)[1].value).toContain(" > ");

    fireEvent.click(within(pick).getByRole("button", { name: "Done" }));
    expect(document.querySelector(".parts__picker")).toBeNull();
  });

  it("Back from the first stage returns to the start screen", () => {
    renderApp();
    fireEvent.click(screen.getByText("Plan a cell"));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Plan a cell")).toBeTruthy();
  });
});

describe("planner — guided flow", () => {
  it("ranks concepts by fully loaded cost, showing the capex split", () => {
    renderApp();
    toConcepts();
    expect(screen.getByText("Concept comparison")).toBeTruthy();
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
    // Refine lands in the editor (chromeless — the stepper gives way to canvas).
    expect(screen.getByRole("tab", { name: "Flow" })).toBeTruthy();
  });

  it("reaches the Summary stage after refining", () => {
    renderApp();
    toConcepts();
    fireEvent.click(screen.getByRole("button", { name: "Refine this layout" }));
    // The editor has a forward exit, not just an entrance.
    fireEvent.click(screen.getByRole("button", { name: "Continue to summary" }));
    expect(screen.getByText("Planning estimate")).toBeTruthy();
    expect(screen.getByText("Loaded cost/part")).toBeTruthy();
  });

  it("opens the full assessment report from the summary", async () => {
    renderApp();
    toConcepts();
    fireEvent.click(screen.getByRole("button", { name: "Refine this layout" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue to summary" }));
    // The summary offers the document view; it reads as a record, not a panel.
    fireEvent.click(screen.getByRole("button", { name: "Open the full report" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Assessment report" })).toBeTruthy());
    // The report prints, and it names the concept that was taken.
    expect(screen.getByRole("button", { name: "Print" })).toBeTruthy();
  });

  it("opens the sample straight into the editor", () => {
    renderApp();
    fireEvent.click(screen.getByText("See an example"));
    expect(screen.getByRole("tab", { name: "Flow" })).toBeTruthy();
  });

  it("runs in four stages, not six", () => {
    renderApp();
    // The stepper shows the four stages during planning (the editor is chromeless).
    fireEvent.click(screen.getByText("Plan a cell"));
    ["Parts & demand", "Concepts", "Refine", "Summary"].forEach((s) =>
      expect(screen.getAllByText(s).length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("Situation")).toBeNull();
    expect(screen.queryByText("Process")).toBeNull();
  });
});
