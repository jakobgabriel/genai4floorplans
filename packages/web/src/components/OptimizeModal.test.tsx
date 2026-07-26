// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { App } from "../App";
import { ToastProvider } from "./ui";

function renderApp() {
  return render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

function loadSample() {
  renderApp();
  fireEvent.click(screen.getByText("Start from the sample cell"));
}

beforeEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  window.location.hash = "";
});
afterEach(cleanup);

// The one-click Optimize flow: press Optimize on the Actual view, read the
// before/after comparison, apply it. Drives the real UI so a broken prop
// hand-off or dead reducer branch fails here even though the engine stays green.
describe("Optimize layout modal", () => {
  it("opens a before/after comparison from the Actual toolbar", () => {
    loadSample();
    fireEvent.click(screen.getByRole("button", { name: "Optimize" }));

    // The Carbon Modal heading + the metric rows an IE cares about.
    expect(screen.getByText("Optimize layout")).toBeTruthy();
    const table = screen.getByLabelText("Before and after comparison");
    expect(within(table).getByText("Flow cost")).toBeTruthy();
    expect(within(table).getByText("Material travel")).toBeTruthy();
    expect(within(table).getByText("Grade")).toBeTruthy();
    expect(within(table).getByText("Output / shift")).toBeTruthy();
    expect(within(table).getByText("Cost / part")).toBeTruthy();
  });

  it("shows the travel reduction the optimiser reports", () => {
    loadSample();
    fireEvent.click(screen.getByRole("button", { name: "Optimize" }));
    // Sample cell re-laid as an I-form: ~29% less travel. The exact figure comes
    // from the engine; assert the sign + magnitude band, not a brittle exact.
    expect(screen.getAllByText(/-2\d(\.\d)?%/).length).toBeGreaterThanOrEqual(1);
    // Apply is offered because the layout genuinely improves.
    expect((screen.getByRole("button", { name: "Apply optimized layout" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a grade that genuinely improves (rating floor sees the better form)", () => {
    loadSample();
    fireEvent.click(screen.getByRole("button", { name: "Optimize" }));
    const table = screen.getByLabelText("Before and after comparison");
    const gradeRow = within(table).getByText("Grade").closest(".cds--structured-list-row") as HTMLElement;
    // Sample grades C; repositioning lifts it to a solid B (flow cost + travel
    // reach 100). It does NOT auto-reach A: the honest 7-KPI rating shows the
    // flow-optimal form still trades off congestion/compactness (audit A-03/A-04),
    // so the grade rises without the old inflation. The Δ is a positive gain.
    expect(within(gradeRow).getByText(/[AB] · [89]\d/)).toBeTruthy();
    expect(within(gradeRow).getByText(/^\+\d/)).toBeTruthy();
    expect(within(gradeRow).queryByText("—")).toBeNull();
  });

  it("previews the rearrangement on the Both canvas without applying", () => {
    loadSample();
    fireEvent.click(screen.getByRole("button", { name: "Optimize" }));
    fireEvent.click(screen.getByRole("button", { name: /See it on the canvas/ }));

    // Modal closes and the side-by-side Both view opens (ACTUAL + IMPROVED).
    expect(screen.queryByText("Optimize layout")).toBeNull();
    expect(screen.getByText("IMPROVED")).toBeTruthy();
    // Nothing was applied — no apply toast.
    expect(screen.queryByText(/Applied I-form layout/)).toBeNull();
  });

  it("applies the optimized layout and closes the modal", () => {
    loadSample();
    fireEvent.click(screen.getByRole("button", { name: "Optimize" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply optimized layout" }));

    // Reused the APPLY_TEMPLATE path → toast confirms the I-form re-lay.
    expect(screen.getByText(/Applied I-form layout/)).toBeTruthy();
    // The modal is gone.
    expect(screen.queryByText("Optimize layout")).toBeNull();
  });
});
