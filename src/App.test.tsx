// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
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
});
