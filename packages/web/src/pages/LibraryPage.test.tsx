// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { ToastProvider } from "../components/ui";
import { loadLibrary } from "../store/library";

function renderApp() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

/** Straight to the library from the front door. */
async function openLibrary() {
  renderApp();
  fireEvent.click(screen.getByText("Process library"));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Process library" })).toBeTruthy());
}

const stored = () => JSON.parse(localStorage.getItem("flowplan_library") ?? "null");

beforeEach(() => {
  cleanup();
  document.body.innerHTML = "";
  localStorage.clear();
  window.location.hash = "";
});
afterEach(cleanup);

describe("the library is its own destination", () => {
  it("is on the front door, not buried in the editor", () => {
    renderApp();
    expect(screen.getByText("Process library")).toBeTruthy();
    expect(screen.getByText("Plan a cell")).toBeTruthy();
  });

  it("opens with no cell loaded at all", async () => {
    await openLibrary();
    // Somebody looking a process up should not have to open a layout first.
    expect(screen.queryByRole("tab", { name: "Flow" })).toBeNull();
  });
});

describe("nothing is seeded", () => {
  it("starts empty", () => {
    expect(loadLibrary()).toEqual({ processes: [], tags: [] });
  });

  it("says so, and offers the built-in catalog as an import rather than a default", async () => {
    await openLibrary();
    expect(screen.getByText("Library is empty")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Import 12 built-in operations/ }));
    await waitFor(() => expect(stored().processes.length).toBe(12));
    // Imported entries are ordinary ones — nothing marks them as not yours.
    expect(stored().processes.every((p: Record<string, unknown>) => !("seeded" in p))).toBe(true);
  });

  it("treats an emptied library as a real state, not as a reason to reseed", () => {
    localStorage.setItem("flowplan_library", JSON.stringify({ processes: [], tags: [] }));
    expect(loadLibrary().processes).toHaveLength(0);
  });
});

describe("editing a process", () => {
  it("fills a new entry in from its name, using the same catalog inference uses", async () => {
    await openLibrary();
    fireEvent.click(screen.getByRole("button", { name: "New process" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "MIG weld" } });
    fireEvent.change(screen.getByLabelText("Cycle (s)"), { target: { value: "72" } });
    await waitFor(() => expect(stored().processes[0].cycleTimeSec).toBe(72));
    expect(stored().processes[0].name).toBe("MIG weld");
  });

  it("carries every process-intrinsic field the station editor has", async () => {
    await openLibrary();
    fireEvent.click(screen.getByRole("button", { name: "New process" }));
    // The answer to "does the library cover what the process UI configures".
    [
      "Cycle (s)",
      "Operator bound (%)",
      "Operators",
      "Changeover (min)",
      "Scrap (%)",
      "Capex",
      "Cost to automate",
      "Power (kW)",
      "Footprint W",
      "Footprint H",
      "Utilities",
    ].forEach((label) => expect(screen.getByLabelText(label), label).toBeTruthy());
    ["Role", "Station type", "Automation", "Work class", "Ergonomic risk"].forEach((label) =>
      expect(screen.getByLabelText(label), label).toBeTruthy(),
    );
  });
});

describe("the extendable half", () => {
  it("takes fields the tool does not model, and keeps them", async () => {
    await openLibrary();
    fireEvent.click(screen.getByRole("button", { name: "New process" }));
    fireEvent.click(screen.getByRole("button", { name: /Add a field/ }));
    fireEvent.change(screen.getByLabelText("Field"), { target: { value: "Tool no." } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "T-4471" } });
    await waitFor(() => expect(stored().processes[0].custom[0]).toMatchObject({ label: "Tool no.", value: "T-4471" }));
  });
});

describe("tags", () => {
  it("groups processes, and a process carries as many as it belongs to", async () => {
    await openLibrary();
    fireEvent.click(screen.getByRole("button", { name: "New process" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));

    fireEvent.change(screen.getByLabelText("New tag"), { target: { value: "Joining" } });
    fireEvent.click(screen.getByRole("button", { name: /Add tag/ }));
    fireEvent.change(screen.getByLabelText("New tag"), { target: { value: "Fume extraction" } });
    fireEvent.click(screen.getByRole("button", { name: /Add tag/ }));
    await waitFor(() => expect(stored().tags).toHaveLength(2));

    // One process, two categories — which is why this is tagging and not a
    // single category field.
    const picker = document.querySelector(".lib-page__tagPick") as HTMLElement;
    fireEvent.click(within(picker).getByRole("tab", { name: "Joining" }));
    fireEvent.click(within(picker).getByRole("tab", { name: "Fume extraction" }));
    await waitFor(() => expect(stored().processes[0].tags).toHaveLength(2));
  });

  it("renames a tag in place rather than making you retag everything", async () => {
    await openLibrary();
    fireEvent.click(screen.getByRole("button", { name: "New process" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
    fireEvent.change(screen.getByLabelText("New tag"), { target: { value: "Joining" } });
    fireEvent.click(screen.getByRole("button", { name: /Add tag/ }));
    await waitFor(() => expect(stored().tags).toHaveLength(1));

    fireEvent.change(screen.getByLabelText("Tag name"), { target: { value: "Welding" } });
    await waitFor(() => expect(stored().tags[0].name).toBe("Welding"));
  });

  it("detaches a deleted tag from every process carrying it", async () => {
    await openLibrary();
    fireEvent.click(screen.getByRole("button", { name: "New process" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit tags" }));
    fireEvent.change(screen.getByLabelText("New tag"), { target: { value: "Joining" } });
    fireEvent.click(screen.getByRole("button", { name: /Add tag/ }));
    await waitFor(() => expect(stored().tags).toHaveLength(1));
    const picker = document.querySelector(".lib-page__tagPick") as HTMLElement;
    fireEvent.click(within(picker).getByRole("tab", { name: "Joining" }));
    await waitFor(() => expect(stored().processes[0].tags).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: /Delete the Joining tag/ }));
    // A process left holding a dead tag id would filter to nothing and read
    // like a bug.
    await waitFor(() => expect(stored().processes[0].tags).toHaveLength(0));
    expect(stored().tags).toHaveLength(0);
  });
});
