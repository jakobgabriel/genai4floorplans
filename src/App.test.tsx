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

beforeEach(() => localStorage.clear());
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
    fireEvent.click(screen.getByText("Balance"));
    expect(screen.getByText(/Line balance & bottleneck/)).toBeTruthy();
    fireEvent.click(screen.getByText("Automation"));
    expect(screen.getByText(/Automation chaining/)).toBeTruthy();
    fireEvent.click(screen.getByText("Schema"));
    expect(screen.getByText(/Data model/)).toBeTruthy();
  });

  it("generates AI proposals from the Copilot tab", async () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    fireEvent.click(screen.getByRole("button", { name: /AI Chat/ }));
    fireEvent.click(screen.getByText(/Propose layout improvements/));
    // a strategist proposal card appears (engine-scored, offline)
    await waitFor(() => expect(screen.getByText(/Sequence steps by flow/)).toBeTruthy());
  });

  it("renders the DAG view and the Yield panel", () => {
    renderApp();
    fireEvent.click(screen.getByText("Start from the sample cell"));
    fireEvent.click(screen.getByText("⊟ DAG"));
    expect(screen.getByText("PROCESS DAG")).toBeTruthy();
    fireEvent.click(screen.getByText("Balance"));
    expect(screen.getByText(/Rolled throughput yield/)).toBeTruthy();
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
