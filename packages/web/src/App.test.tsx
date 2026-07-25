// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "./App";
import { ToastProvider } from "./components/ui";

function renderApp() {
  return render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

beforeEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  window.location.hash = ""; // reset the hash router between tests
});
afterEach(cleanup);

// Smoke tests: the App must mount and wire its panels/views without crashing —
// the type checker can't catch a bad prop hand-off or a dead reducer branch.
describe("App", () => {
  it("renders the onboarding empty state on first visit", () => {
    renderApp();
    expect(screen.getByText("Start blank")).toBeTruthy();
  });

  it("loads the sample cell and opens the editor on its flow", () => {
    renderApp();
    fireEvent.click(screen.getByText("Open the sample cell"));
    expect(screen.getAllByText(/CNC Turning/).length).toBeGreaterThan(0);
    // The rail edits the cell; the assessment is not in it.
    expect(screen.getByRole("tab", { name: "Flow" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Element" })).toBeTruthy();
    expect(screen.queryByText("Actual-state rating")).toBeNull();
  });

  it("reads the whole analysis on its own page, in path order", async () => {
    const { container } = renderApp();
    fireEvent.click(screen.getByText("Open the sample cell"));
    fireEvent.click(screen.getByRole("button", { name: "Analysis" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Analysis" })).toBeTruthy());

    const heads = [...container.querySelectorAll(".anp__h")].map((h) => h.textContent);
    expect(heads).toEqual([
      "Verdict",
      "Flow & layout",
      "Balance & bottleneck",
      "Yield",
      "Automation",
      "Cost",
    ]);
    // Each stage rendered its body, not just its heading.
    expect(screen.getByText(/Where the cost sits/)).toBeTruthy();
    expect(screen.getByText(/Throughput per step/)).toBeTruthy();
    expect(screen.getByText(/Automation chaining/)).toBeTruthy();
    expect(screen.getByText(/Cost & ROI/)).toBeTruthy();
  });

  it("saves a variant from the toolbar and lists it in the Variants menu", () => {
    renderApp();
    fireEvent.click(screen.getByText("Open the sample cell"));
    // Saving is a toolbar action — reachable without opening any panel.
    fireEvent.click(screen.getByRole("button", { name: /Save variant/ }));
    // Both the toolbar button and the dialog's say "Save variant"; the dialog is later in the DOM.
    const saves = screen.getAllByRole("button", { name: "Save variant" });
    fireEvent.click(saves[saves.length - 1]);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: /^Variants \(1\)/ }));
    expect(screen.getByRole("menuitem", { name: /Manage variants/ })).toBeTruthy();
    expect(screen.getAllByText(/Hydrobuchse/).length).toBeGreaterThan(0);
  });

  it("opens the assessment report as its own page", async () => {
    const { container } = renderApp();
    fireEvent.click(screen.getByText("Open the sample cell"));
    fireEvent.click(screen.getByRole("button", { name: "Export ▾" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Open report" }));
    // hashchange is async.
    await waitFor(() => expect(screen.getByRole("heading", { name: "Assessment report" })).toBeTruthy());
    const heads = [...container.querySelectorAll(".rep__secTitle")].map((h) => h.textContent);
    expect(heads).toEqual(["1The brief", "2The concept", "3The layout", "4The assessment", "5What is still open"]);
    // Read-only: the panels' editors have no place in a document.
    expect(screen.queryByText("Rating weights")).toBeNull();
    expect(screen.getByRole("button", { name: /Print/ })).toBeTruthy();
  });

  it("switches between the two rail tabs without error", () => {
    renderApp();
    fireEvent.click(screen.getByText("Open the sample cell"));
    fireEvent.click(screen.getByRole("tab", { name: "Element" }));
    expect(screen.getByText("No step selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Flow" }));
    expect(screen.getByText(/Draw connections/)).toBeTruthy();
    // Schema lives behind the help icon in the tab bar.
    fireEvent.click(screen.getByRole("button", { name: /Data model reference/ }));
    expect(screen.getAllByText(/Data model/).length).toBeGreaterThan(0);
  });

  it("generates AI proposals from the assistant page", async () => {
    renderApp();
    fireEvent.click(screen.getByText("Open the sample cell"));
    fireEvent.click(screen.getByRole("button", { name: "⋯" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Assistant" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Assistant" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Propose improvements/ }));
    // a strategist proposal card appears (engine-scored, offline)
    await waitFor(() => expect(screen.getByText(/Sequence steps by flow/)).toBeTruthy());
  });

  it("renders the DAG view", () => {
    renderApp();
    fireEvent.click(screen.getByText("Open the sample cell"));
    // View toggle now sits in the sub-toolbar above the canvas.
    fireEvent.click(screen.getByText("⊟ DAG"));
    expect(screen.getByText("PROCESS DAG")).toBeTruthy();
  });

  it("navigates to the dedicated Site overview page", async () => {
    renderApp();
    fireEvent.click(screen.getByText("Open the sample cell"));
    fireEvent.click(screen.getByRole("button", { name: "⋯" }));
    fireEvent.click(screen.getByText("Site overview"));
    // Site is now a dedicated page (hash route), not a pop-up (hashchange is async).
    await waitFor(() => expect(screen.getByRole("heading", { name: "Site overview" })).toBeTruthy());
    expect(screen.getByText("Total throughput")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Editor" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Flow" })).toBeTruthy());
  });

  it("navigates to the dedicated Compare page", async () => {
    renderApp();
    fireEvent.click(screen.getByText("Open the sample cell"));
    fireEvent.click(screen.getByRole("button", { name: "⋯" }));
    fireEvent.click(screen.getByText("Compare variants"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Compare variants" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Editor" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Flow" })).toBeTruthy());
  });

  it("opens the freeform footprint editor without crashing", () => {
    renderApp();
    fireEvent.click(screen.getByText("Open the sample cell"));
    fireEvent.click(screen.getByText("⊟ DAG"));
    // click a DAG node to select + open Configure. The name also appears in the
    // Analysis page's per-step lists, and the canvas precedes the rail.
    fireEvent.click(screen.getAllByText("CNC Turning")[0]);
    expect(screen.getByText(/Footprint shape/)).toBeTruthy();
  });
});
