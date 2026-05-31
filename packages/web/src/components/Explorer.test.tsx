// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
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

  it("creates a root folder via an inline input (no browser prompt)", () => {
    const api = makeApi();
    const promptSpy = vi.spyOn(window, "prompt");
    render(<Explorer api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByText("＋ Folder"));
    const input = screen.getByPlaceholderText("Folder name");
    fireEvent.change(input, { target: { value: "New line" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(api.createFolder).toHaveBeenCalledWith("New line", null);
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("renames a folder inline (no browser prompt)", () => {
    const api = makeApi();
    render(<Explorer api={api} onClose={() => {}} />);
    fireEvent.click(screen.getAllByTitle("Folder actions")[0]);
    fireEvent.click(screen.getByText("Rename"));
    const input = screen.getByDisplayValue("Line 1");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(api.renameFolder).toHaveBeenCalledWith("f1", "Renamed");
  });

  it("adds a layout into a folder from its action menu", () => {
    const api = makeApi();
    render(<Explorer api={api} onClose={() => {}} />);
    fireEvent.click(screen.getAllByTitle("Folder actions")[0]);
    fireEvent.click(screen.getByText("New layout here"));
    expect(api.addCell).toHaveBeenCalledWith(expect.anything(), undefined, "f1");
  });

  it("moves a layout by dragging it onto a folder", () => {
    const api = makeApi();
    render(<Explorer api={api} onClose={() => {}} />);
    const cellRow = screen.getByText(/Root layout/).closest(".tree-row") as HTMLElement;
    const folderRow = screen.getByText(/🗀 Line 1/).closest(".tree-row") as HTMLElement;
    fireEvent.dragStart(cellRow);
    fireEvent.dragOver(folderRow);
    fireEvent.drop(folderRow);
    expect(api.moveCell).toHaveBeenCalledWith("c1", "f1");
  });

  it("moves a layout to the root by dropping on empty tree space", () => {
    const api = makeApi();
    const { container } = render(<Explorer api={api} onClose={() => {}} />);
    const nested = screen.getByText(/Nested layout/).closest(".tree-row") as HTMLElement;
    const tree = container.querySelector(".explorer-tree") as HTMLElement;
    fireEvent.dragStart(nested);
    fireEvent.drop(tree);
    expect(api.moveCell).toHaveBeenCalledWith("c2", null);
  });

  it("deletes a folder via an inline confirm (no browser confirm)", () => {
    const api = makeApi();
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<Explorer api={api} onClose={() => {}} />);
    fireEvent.click(screen.getAllByTitle("Folder actions")[0]);
    fireEvent.click(screen.getByText("Delete"));
    // inline "Delete? ✓ ✗" appears; clicking ✓ performs the delete
    fireEvent.click(screen.getByTitle("Confirm delete"));
    expect(api.deleteFolder).toHaveBeenCalledWith("f1");
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
