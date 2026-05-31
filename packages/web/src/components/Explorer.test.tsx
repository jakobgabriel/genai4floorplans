// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import { Explorer } from "./Explorer";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { Folder } from "../store/workspace";

// A spy stand-in for the bits of FlowPlanApi the Explorer touches. The data layer
// (folder CRUD, reparenting) is covered by the workspace/storage tests; here we
// assert the tree renders and the row actions call the right api methods.
function makeApi(over: Partial<FlowPlanApi> = {}): FlowPlanApi {
  const folders: Folder[] = [
    { id: "f1", name: "Line 1", parentId: null, position: 0 },
    { id: "f2", name: "Sub", parentId: "f1", position: 0 },
  ];
  const cells = [
    { id: "c1", name: "Root layout", folderId: null },
    { id: "c2", name: "Nested layout", folderId: "f2" },
  ];
  return {
    folders,
    cells,
    activeId: "c1",
    switchCell: vi.fn(),
    moveCell: vi.fn(),
    addCell: vi.fn(),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    ...over,
  } as unknown as FlowPlanApi;
}

beforeEach(() => cleanup());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Explorer", () => {
  it("renders the nested folder tree with layouts", () => {
    render(<Explorer api={makeApi()} onClose={() => {}} />);
    // folder names also appear in each row's move-to picker, so allow multiples
    expect(screen.getAllByText(/Line 1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sub/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Root layout/)).toBeTruthy();
    expect(screen.getByText(/Nested layout/)).toBeTruthy();
  });

  it("switches to a layout when its row is clicked", () => {
    const api = makeApi();
    render(<Explorer api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByText(/Nested layout/));
    expect(api.switchCell).toHaveBeenCalledWith("c2");
  });

  it("creates a root folder via the ＋ Folder button (prompted name)", () => {
    const api = makeApi();
    vi.spyOn(window, "prompt").mockReturnValue("New line");
    render(<Explorer api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByText("＋ Folder"));
    expect(api.createFolder).toHaveBeenCalledWith("New line", null);
  });

  it("adds a layout into a folder from its action menu", () => {
    const api = makeApi();
    render(<Explorer api={api} onClose={() => {}} />);
    // open the first folder's "⋯" menu (Line 1) and click "New layout here"
    fireEvent.click(screen.getAllByTitle("Folder actions")[0]);
    fireEvent.click(screen.getByText("New layout here"));
    expect(api.addCell).toHaveBeenCalledWith(expect.anything(), undefined, "f1");
  });

  it("moves a layout via the row's Move-to picker", () => {
    const api = makeApi();
    render(<Explorer api={api} onClose={() => {}} />);
    // the root layout's move picker → choose the Sub folder
    const rootRow = screen.getByText(/Root layout/).closest(".tree-row") as HTMLElement;
    fireEvent.change(within(rootRow).getByRole("combobox"), { target: { value: "f2" } });
    expect(api.moveCell).toHaveBeenCalledWith("c1", "f2");
  });

  it("deletes a folder (confirmed) and reparents via api", () => {
    const api = makeApi();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Explorer api={api} onClose={() => {}} />);
    fireEvent.click(screen.getAllByTitle("Folder actions")[0]);
    fireEvent.click(screen.getByText("Delete"));
    expect(api.deleteFolder).toHaveBeenCalledWith("f1");
  });
});
