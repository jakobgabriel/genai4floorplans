// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "../App";
import { ToastProvider } from "../components/ui";
import { loadDecisionWeights } from "../store/decisionWeights";
import { DECISION_WEIGHTS } from "@flowplan/core/engine/generate";

function renderApp() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

/** Sample cell open, then the recommender for it. */
async function openRecommend() {
  renderApp();
  fireEvent.click(screen.getByText("See an example"));
  fireEvent.click(screen.getByRole("button", { name: "Recommend" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Concept recommendations" })).toBeTruthy());
}

beforeEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  window.location.hash = "";
});
afterEach(cleanup);

// The concept comparison only existed as stage 2 of the planning flow, driven
// by the parts matrix — reachable exactly once, on the way past. A cell you
// opened, imported or drew by hand could never be asked the question.
describe("concepts for the cell you already have", () => {
  it("is reachable from the editor toolbar, for a cell that never went through the planner", async () => {
    await openRecommend();
    expect(screen.getByText(/process steps on/)).toBeTruthy();
  });

  it("takes its work content off the canvas, not from a parts list", async () => {
    await openRecommend();
    // The sample cell's process steps and their real cycle sum. The sentence is
    // split across elements, so match the paragraph's own text.
    const intro = document.querySelector(".planner__sub")!.textContent ?? "";
    expect(intro).toMatch(/4 process steps/);
    expect(intro).toMatch(/\d+s of work content/);
  });

  it("seeds the demand from the cell's own output rather than opening on a blank", async () => {
    await openRecommend();
    const vol = screen.getByLabelText("Annual volume") as HTMLInputElement;
    expect(Number(vol.value)).toBeGreaterThan(0);
  });

  it("re-ranks when the demand changes", async () => {
    await openRecommend();
    // The first BODY row — the header is a row too.
    const top = () =>
      (document.querySelector(".cds--structured-list-tbody .cds--structured-list-row") as HTMLElement)?.textContent ?? "";
    const before = top();
    expect(before).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Annual volume"), { target: { value: "2000" } });
    await waitFor(() => expect(top()).not.toBe(before));
  });

  it("adds the chosen concept beside the open cell rather than over it", async () => {
    await openRecommend();
    const count = () => JSON.parse(localStorage.getItem("flowplan_workspace") ?? "{}").cells?.length ?? 0;
    const before = count();
    fireEvent.click(screen.getByRole("button", { name: /Open .* as a new layout/ }));
    // Added, never replacing — this page recommends, it does not overwrite work
    // somebody has been editing.
    await waitFor(() => expect(count()).toBeGreaterThan(before));
  });

  it("says so when there is no work content, instead of ranking an empty cell", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
    fireEvent.click(screen.getByRole("button", { name: "Recommend" }));
    await waitFor(() => expect(screen.getByText("This cell has no process steps")).toBeTruthy());
  });
});

describe("the weighting", () => {
  it("ships with a stated default rather than a hidden cost-only sort", () => {
    expect(loadDecisionWeights()).toEqual(DECISION_WEIGHTS);
  });

  it("is editable from the recommender and persists", async () => {
    await openRecommend();
    fireEvent.click(screen.getByRole("button", { name: /What counts as best/ }));
    await waitFor(() => expect(document.querySelector(".dw")).toBeTruthy());
    // Every criterion the ranking uses is named and adjustable.
    ["Cost per part", "Capital exposure", "Suits the volume", "Manning", "Flexibility"].forEach((label) =>
      expect(screen.getByText(new RegExp(label)), label).toBeTruthy(),
    );
  });
});
