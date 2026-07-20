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

// Balance now lives in the dedicated Analysis view (the rail is inputs-only).
function openBalance() {
  fireEvent.click(screen.getByText("📊 Analysis"));
  fireEvent.click(screen.getByRole("button", { name: "Balance" }));
}

/** Select a station on the DAG and open its Configure/Inspect panel. Station
 *  names also appear in the panel lists, so always take the first match. The
 *  inspector keeps advanced fields (cycle decomposition, footprint, ports)
 *  behind an "Advanced settings" toggle, so expand it for the tests that need
 *  those controls. */
function inspect(stationName: string) {
  fireEvent.click(screen.getByText("⊟ DAG"));
  fireEvent.click(screen.getAllByText(stationName)[0]);
  const adv = screen.queryByRole("button", { name: /Advanced settings/ });
  if (adv) fireEvent.click(adv);
}

/** The opaque "Cycle time (s)" input, located via its field label. */
function cycleField(): HTMLInputElement {
  // The label carries a Carbon Toggletip (help) button once decomposed, so scope
  // the match to the input itself.
  return screen.getByLabelText(/Cycle time \(s\)/, { selector: "input" }) as HTMLInputElement;
}

/** The five breakdown inputs, scoped to the breakdown card. */
function breakdownInputs(): HTMLInputElement[] {
  const card = screen.getByText("Cycle breakdown").closest(".card") as HTMLElement;
  return within(card).getAllByRole("spinbutton") as HTMLInputElement[];
}

beforeEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  window.location.hash = "";
});
afterEach(cleanup);

// Case 3 / P0: cycle-time decomposition. These drive the real UI path rather
// than the engine directly, so a broken prop hand-off or dead reducer branch
// fails here even though the engine tests stay green.
describe("cycle decomposition UI", () => {
  it("prompts to decompose when no step has a breakdown", () => {
    loadSample();
    openBalance();
    expect(screen.getByText(/Value add vs waste/)).toBeTruthy();
    expect(screen.getByText(/No step has a cycle breakdown yet/)).toBeTruthy();
  });

  it("offers a Decompose button on a process step and not on I/O areas", () => {
    loadSample();
    inspect("CNC Turning");
    expect(screen.getByRole("button", { name: /Decompose cycle/ })).toBeTruthy();

    // "Raw Material" is role=input — decomposition does not apply.
    fireEvent.click(screen.getAllByText("Raw Material")[0]);
    expect(screen.queryByRole("button", { name: /Decompose cycle/ })).toBeNull();
  });

  it("decomposing seeds from the opaque cycle and locks the scalar field", () => {
    loadSample();
    inspect("CNC Turning");
    expect(cycleField().value).toBe("42");
    fireEvent.click(screen.getByRole("button", { name: /Decompose cycle/ }));

    expect(screen.getByText("Cycle breakdown")).toBeTruthy();
    // Sample CNC is 42s; the seed puts all of it in value-add => 100%.
    expect(screen.getByText(/100% value-add/)).toBeTruthy();

    // The legacy scalar becomes read-only, since the breakdown now owns it.
    expect(cycleField().disabled).toBe(true);
    expect(cycleField().value).toBe("42");
  });

  it("moving seconds into a waste class updates the total and the ratio", () => {
    loadSample();
    inspect("CNC Turning");
    fireEvent.click(screen.getByRole("button", { name: /Decompose cycle/ }));

    const card = screen.getByText("Cycle breakdown").closest(".card") as HTMLElement;
    const inputs = breakdownInputs();
    expect(inputs).toHaveLength(5); // valueAdd, handling, walk, wait, setup

    fireEvent.change(inputs[0], { target: { value: "30" } }); // value-add 42 -> 30
    fireEvent.change(inputs[1], { target: { value: "10" } }); // handling 0 -> 10

    // 30 + 10 = 40s total, 75% value-add.
    expect(within(card).getByText("40s")).toBeTruthy();
    expect(screen.getByText(/75% value-add/)).toBeTruthy();
  });

  it("surfaces the line ratio and waste backlog on the Balance tab", () => {
    loadSample();
    inspect("Assembly");
    fireEvent.click(screen.getByRole("button", { name: /Decompose cycle/ }));

    const inputs = breakdownInputs();
    fireEvent.change(inputs[0], { target: { value: "50" } }); // value add
    fireEvent.change(inputs[1], { target: { value: "30" } }); // handling
    fireEvent.change(inputs[3], { target: { value: "20" } }); // wait

    openBalance();
    // 50 / 100 => 50% value-add across the one decomposed step.
    expect(screen.getByText(/Value-add ratio \(decomposed steps only\)/)).toBeTruthy();
    expect(screen.getByText("Waste backlog (largest first)")).toBeTruthy();
    // Handling (30s) outranks wait (20s).
    expect(screen.getByText(/Biggest single loss: handling at Assembly/)).toBeTruthy();
  });

  // CNC Turning is the sample's bottleneck (685/shift vs Assembly's 909), so it
  // is the station bottleneckAdvice reports on.
  it("bottleneck advice names the dominant waste class once decomposed", () => {
    loadSample();
    inspect("CNC Turning");
    fireEvent.click(screen.getByRole("button", { name: /Decompose cycle/ }));

    const inputs = breakdownInputs();
    fireEvent.change(inputs[0], { target: { value: "20" } }); // value add
    fireEvent.change(inputs[1], { target: { value: "30" } }); // handling dominates

    openBalance();
    // 30s of a 50s cycle = 60% handling.
    expect(screen.getByText(/Cycle is 50s, of which 30s \(60%\) is handling/)).toBeTruthy();
  });

  it("Reset restores the opaque cycle field", () => {
    loadSample();
    inspect("CNC Turning");
    fireEvent.click(screen.getByRole("button", { name: /Decompose cycle/ }));

    const card = screen.getByText("Cycle breakdown").closest(".card") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Reset" }));

    expect(screen.queryByText("Cycle breakdown")).toBeNull();
    expect(cycleField().disabled).toBe(false);
    expect(cycleField().value).toBe("42");
  });
});
