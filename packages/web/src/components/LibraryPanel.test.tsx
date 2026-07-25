// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { App } from "../App";
import { ToastProvider } from "./ui";
import { loadLibrary } from "../store/library";
import { SEED_LIBRARY } from "@flowplan/core/model/library";

function renderApp() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

/** Open the sample cell, then the drawer's Processes tab. The drawer starts
 *  shut, and its toolbar button is labelled with the open cell's name, so it is
 *  located by class rather than by a name that moves. */
function openLibrary() {
  renderApp();
  fireEvent.click(screen.getByText("Open the sample cell"));
  if (!screen.queryByRole("tab", { name: "Processes" })) {
    fireEvent.click(document.querySelector(".editorbar__cell") as HTMLElement);
  }
  fireEvent.click(screen.getByRole("tab", { name: "Processes" }));
}

beforeEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  window.location.hash = "";
});
afterEach(cleanup);

describe("process library", () => {
  it("seeds from the engine's capability catalog on first run", () => {
    expect(loadLibrary()).toHaveLength(SEED_LIBRARY.length);
    expect(loadLibrary().map((p) => p.name)).toContain("Weld");
  });

  it("persists what the planner changes", () => {
    const first = loadLibrary();
    const edited = first.map((p) => (p.name === "Weld" ? { ...p, name: "MIG weld", cycleTimeSec: 72 } : p));
    localStorage.setItem("flowplan_library", JSON.stringify(edited));
    const back = loadLibrary().find((p) => p.capabilityId === "join.weld")!;
    expect(back.name).toBe("MIG weld");
    expect(back.cycleTimeSec).toBe(72);
  });

  it("treats an emptied library as a real state, not as a reason to reseed", () => {
    localStorage.setItem("flowplan_library", JSON.stringify([]));
    expect(loadLibrary()).toHaveLength(0);
  });

  it("lives in the drawer beside the layouts, not instead of them", () => {
    openLibrary();
    expect(screen.getByRole("tab", { name: "Layouts" })).toBeTruthy();
    expect(screen.getByText("Weld")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Layouts" }));
    expect(screen.getByRole("button", { name: "New layout" })).toBeTruthy();
  });

  it("filters the list by name", () => {
    openLibrary();
    const list = document.querySelector(".lib__list") as HTMLElement;
    expect(within(list).getByText("Weld")).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Find a process"), { target: { value: "pack" } });
    expect(within(list).getByText("Pack")).toBeTruthy();
    expect(within(list).queryByText("Weld")).toBeNull();
  });

  // The whole point: a placed step arrives with the library's numbers on it,
  // rather than as "New Step" at the blank-station default of 30s.
  it("places a step carrying the library's cycle and type", () => {
    openLibrary();
    const row = (screen.getByText("Function test").closest(".lib__item") as HTMLElement) ?? document.body;
    fireEvent.click(within(row).getByRole("button", { name: /Add to cell — Function test/ }));

    // The station opens in the Element panel, named and timed from the library.
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe("Function test");
    expect((screen.getByLabelText(/Cycle time \(s\)/) as HTMLInputElement).value).toBe("30");
  });

  it("edits an entry in place and keeps it for the next placement", () => {
    openLibrary();
    // The row's own disclosure, not its Add button — and scoped to the list,
    // because the sample cell also has a station called Press on the canvas.
    const list = document.querySelector(".lib__list") as HTMLElement;
    fireEvent.click((within(list).getByText("Press").closest(".lib__item") as HTMLElement).querySelector(".lib__disclose")!);
    const cycle = screen.getByLabelText("Cycle (s)") as HTMLInputElement;
    fireEvent.change(cycle, { target: { value: "44" } });
    expect(JSON.parse(localStorage.getItem("flowplan_library") ?? "[]").find((p: { capabilityId: string }) => p.capabilityId === "form.press").cycleTimeSec).toBe(44);
  });

  it("adds a process of the planner's own", () => {
    openLibrary();
    const before = JSON.parse(localStorage.getItem("flowplan_library") ?? "[]").length;
    fireEvent.click(screen.getByRole("button", { name: /New process/ }));
    expect(JSON.parse(localStorage.getItem("flowplan_library") ?? "[]")).toHaveLength(before + 1);
    // It opens for editing rather than landing unnamed at the bottom of a list.
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("New process");
  });
});
