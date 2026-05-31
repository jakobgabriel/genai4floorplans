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

  it("loads the sample cell and shows its rating + stations", () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    // grade letter + a station from the sample appear
    expect(screen.getAllByText(/CNC Turning/).length).toBeGreaterThan(0);
    expect(screen.getByText("Actual-state rating")).toBeTruthy();
  });

  it("switches between side-panel tabs without error", () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    // Balance is a sub-tab under the Insights group (active by default).
    fireEvent.click(screen.getByRole("button", { name: "Balance" }));
    expect(screen.getByText(/Line balance & bottleneck/)).toBeTruthy();
    // Automation is its own top-level group button.
    fireEvent.click(screen.getByRole("button", { name: "Automation" }));
    expect(screen.getByText(/Automation chaining/)).toBeTruthy();
    // Schema lives behind the "?" help icon.
    fireEvent.click(screen.getByRole("button", { name: "?" }));
    expect(screen.getByText(/Data model/)).toBeTruthy();
  });

  it("generates AI proposals from the AI Chat group", async () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    fireEvent.click(screen.getByRole("button", { name: "AI Chat" }));
    fireEvent.click(screen.getByText(/Propose layout improvements/));
    // a strategist proposal card appears (engine-scored, offline)
    await waitFor(() => expect(screen.getByText(/Sequence steps by flow/)).toBeTruthy());
  });

  it("renders the DAG view and the Yield panel", () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    // View toggle now sits in the sub-toolbar above the canvas.
    fireEvent.click(screen.getByText("⊟ DAG"));
    expect(screen.getByText("PROCESS DAG")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Balance" }));
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
    await waitFor(() => expect(screen.getByText("Actual-state rating")).toBeTruthy());
  });

  it("navigates to the dedicated Compare page", async () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    fireEvent.click(screen.getByRole("button", { name: "⋯" }));
    fireEvent.click(screen.getByText("Compare scenarios"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Compare scenarios" })).toBeTruthy());
    fireEvent.click(screen.getByText("← Editor"));
    await waitFor(() => expect(screen.getByText("Actual-state rating")).toBeTruthy());
  });

  it("opens the freeform footprint editor without crashing", () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    fireEvent.click(screen.getByText("⊟ DAG"));
    // click a DAG node to select + open Configure
    fireEvent.click(screen.getByText("CNC Turning"));
    expect(screen.getByText(/Footprint shape/)).toBeTruthy();
  });
});
