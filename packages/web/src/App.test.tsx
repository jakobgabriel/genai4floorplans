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

// The right rail is inputs-only now; all derived analysis lives in the dedicated
// Analysis view. Open it, then pick an analysis sub-tab.
function openAnalysis(subTab: string) {
  fireEvent.click(screen.getByText("📊 Analysis"));
  fireEvent.click(screen.getByRole("button", { name: subTab }));
}

// Smoke tests: the App must mount and wire its panels/views without crashing —
// the type checker can't catch a bad prop hand-off or a dead reducer branch.
describe("App", () => {
  it("renders the onboarding empty state on first visit", () => {
    renderApp();
    expect(screen.getByText("Start blank")).toBeTruthy();
  });

  it("loads the sample cell and shows its rating + stations", () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    // grade letter + a station from the sample appear
    expect(screen.getAllByText(/CNC Turning/).length).toBeGreaterThan(0);
    openAnalysis("Overview");
    // The Overview is now a Carbon dashboard (stat tiles + Yamazumi + precedence).
    expect(screen.getByText("Yamazumi — cycle time by station")).toBeTruthy();
  });

  it("switches between analysis sub-tabs without error", () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    openAnalysis("Balance");
    expect(screen.getByText(/Line balance & bottleneck/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Automation" }));
    expect(screen.getByText(/Automation chaining/)).toBeTruthy();
    // Schema lives behind the "?" help icon in the inputs rail.
    fireEvent.click(screen.getByText("● Actual"));
    fireEvent.click(screen.getByRole("button", { name: "?" }));
    expect(screen.getByText(/Data model/)).toBeTruthy();
  });

  // AI Chat is hidden for now, so there is no AI tab to drive. The offline
  // strategist path is still covered by the engine/store tests.
  it.skip("generates AI proposals from the Analysis AI Chat tab", async () => {
    // intentionally skipped while the AI surface is hidden.
  });

  it("renders the DAG view and the Yield panel", () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    // View toggle now sits in the sub-toolbar above the canvas.
    fireEvent.click(screen.getByText("⊟ DAG"));
    expect(screen.getByText("PROCESS DAG")).toBeTruthy();
    openAnalysis("Balance");
    expect(screen.getByText(/Rolled throughput yield/)).toBeTruthy();
  });

  it("navigates to the dedicated Site overview page", async () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    fireEvent.click(screen.getByText("Site"));
    // Site is now a dedicated page (hash route), not a pop-up (hashchange is async).
    await waitFor(() => expect(screen.getByRole("heading", { name: "Site overview" })).toBeTruthy());
    expect(screen.getByText("Total throughput")).toBeTruthy();
    fireEvent.click(screen.getByText("← Editor"));
    await waitFor(() => expect(screen.getByText("● Actual")).toBeTruthy());
  });

  it("navigates to the dedicated Compare page", async () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    fireEvent.click(screen.getByRole("button", { name: "⋯" }));
    fireEvent.click(screen.getByText("Compare scenarios"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Compare scenarios" })).toBeTruthy());
    fireEvent.click(screen.getByText("← Editor"));
    await waitFor(() => expect(screen.getByText("● Actual")).toBeTruthy());
  });

  it("opens the process library and shows an element's documentation", async () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    // The library rail's "manage" link opens the full library page.
    fireEvent.click(screen.getByText("manage"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Process library" })).toBeTruthy());
    // Select the first catalog entry, then read its full data sheet.
    fireEvent.click(screen.getByText("CNC turning"));
    fireEvent.click(screen.getByRole("button", { name: "Documentation" }));
    // The doc surfaces the whole data model, not just name/cycle.
    expect(screen.getByText("Capability (N:M)")).toBeTruthy();
    expect(screen.getByText("turning")).toBeTruthy();
  });

  it("authors a custom (non-predefined) library element", async () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    fireEvent.click(screen.getByText("manage"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Process library" })).toBeTruthy());
    fireEvent.click(screen.getByText("＋ New element"));
    // A new custom entry appears, tagged and selected for editing.
    expect(screen.getAllByText(/New element/).length).toBeGreaterThan(0);
    expect(screen.getByText("custom")).toBeTruthy();
  });

  it("opens the freeform footprint editor without crashing", () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    fireEvent.click(screen.getByText("⊟ DAG"));
    // click a DAG node to select + open Configure
    fireEvent.click(screen.getByText("CNC Turning"));
    // Footprint editing lives under the inspector's Advanced section.
    fireEvent.click(screen.getByRole("button", { name: /Advanced settings/ }));
    expect(screen.getByText(/Footprint shape/)).toBeTruthy();
  });
});
