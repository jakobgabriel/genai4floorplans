// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { Explorer } from "./Explorer";
import type { FlowPlanApi } from "../store/useFlowPlan";
import type { Concept, Folder } from "../store/workspace";

// A spy stand-in for the bits of FlowPlanApi the Explorer touches. The data layer
// (folder/concept CRUD, reparenting) is covered by the workspace/store tests;
// here we assert the Folder > Concept > Layout tree renders and the row actions
// call the right api methods.
function makeApi(over: Partial<FlowPlanApi> = {}): FlowPlanApi {
  const folders: Folder[] = [
    { id: "f1", name: "Line 1", parentId: null, position: 0 },
    { id: "f2", name: "Sub", parentId: "f1", position: 0 },
  ];
  const concepts: Concept[] = [
    { id: "cpt1", name: "Root concept", folderId: null, position: 0 },
    { id: "cpt2", name: "Nested concept", folderId: "f2", position: 0 },
  ];
  const cells = [
    { id: "c1", name: "Root layout", folderId: null, conceptId: "cpt1" },
    { id: "c2", name: "Nested layout", folderId: "f2", conceptId: "cpt2" },
  ];
  return {
    folders,
    concepts,
    cells,
    activeId: "c1",
    switchCell: vi.fn(),
    moveCell: vi.fn(),
    addCell: vi.fn(),
    createFolder: vi.fn(),
    createConcept: vi.fn(),
    renameFolder: vi.fn(),
    renameConcept: vi.fn(),
    moveFolder: vi.fn(),
    moveConcept: vi.fn(),
    archiveCell: vi.fn(),
    archiveConcept: vi.fn(),
    archiveFolder: vi.fn(),
    archivedCells: [],
    archivedConcepts: [],
    archivedFolders: [],
    ...over,
  } as unknown as FlowPlanApi;
}

beforeEach(() => cleanup());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Explorer", () => {
  it("renders the folder > concept > layout tree", () => {
    render(<Explorer api={makeApi()} onCollapse={() => {}} />);
    expect(screen.getAllByText(/Line 1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sub/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Root concept/)).toBeTruthy();
    expect(screen.getByText(/Nested concept/)).toBeTruthy();
    expect(screen.getByText(/Root layout/)).toBeTruthy();
    expect(screen.getByText(/Nested layout/)).toBeTruthy();
  });

  it("switches to a layout when its row is clicked", () => {
    const api = makeApi();
    render(<Explorer api={api} onCollapse={() => {}} />);
    fireEvent.click(screen.getByText(/Nested layout/));
    expect(api.switchCell).toHaveBeenCalledWith("c2");
  });

  it("creates a root folder via an inline input (no browser prompt)", () => {
    const api = makeApi();
    const promptSpy = vi.spyOn(window, "prompt");
    render(<Explorer api={api} onCollapse={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Folder" }));
    const input = screen.getByPlaceholderText("Folder name");
    fireEvent.change(input, { target: { value: "New line" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(api.createFolder).toHaveBeenCalledWith("New line", null);
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it("creates a root concept via an inline input", () => {
    const api = makeApi();
    render(<Explorer api={api} onCollapse={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Concept" }));
    const input = screen.getByPlaceholderText("Concept name");
    fireEvent.change(input, { target: { value: "New concept" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(api.createConcept).toHaveBeenCalledWith("New concept", null);
  });

  it("renames a folder inline (no browser prompt)", () => {
    const api = makeApi();
    render(<Explorer api={api} onCollapse={() => {}} />);
    fireEvent.click(screen.getAllByTitle("Folder actions")[0]);
    fireEvent.click(screen.getByText("Rename"));
    const input = screen.getByDisplayValue("Line 1");
    fireEvent.change(input, { target: { value: "Renamed" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(api.renameFolder).toHaveBeenCalledWith("f1", "Renamed");
  });

  it("adds a layout into a concept from its action menu", () => {
    const api = makeApi();
    render(<Explorer api={api} onCollapse={() => {}} />);
    const row = screen.getByText(/Root concept/).closest('[role="treeitem"]') as HTMLElement;
    fireEvent.click(row.querySelector('[title="Concept actions"]') as HTMLElement);
    fireEvent.click(screen.getByText("New layout"));
    expect(api.addCell).toHaveBeenCalledWith(expect.anything(), undefined, "cpt1");
  });

  it("moves a layout by dragging it onto a concept", () => {
    const api = makeApi();
    render(<Explorer api={api} onCollapse={() => {}} />);
    const cellRow = screen.getByText(/Root layout/).closest('[role="treeitem"]') as HTMLElement;
    const conceptRow = screen.getByText(/Nested concept/).closest('[role="treeitem"]') as HTMLElement;
    fireEvent.dragStart(cellRow);
    fireEvent.dragOver(conceptRow);
    fireEvent.drop(conceptRow);
    expect(api.moveCell).toHaveBeenCalledWith("c1", "cpt2");
  });

  it("moves a concept to the root by dropping on empty tree space", () => {
    const api = makeApi();
    const { container } = render(<Explorer api={api} onCollapse={() => {}} />);
    const nested = screen.getByText(/Nested concept/).closest('[role="treeitem"]') as HTMLElement;
    const tree = container.querySelector(".explorer-tree") as HTMLElement;
    fireEvent.dragStart(nested);
    fireEvent.drop(tree);
    expect(api.moveConcept).toHaveBeenCalledWith("cpt2", null);
  });

  it("archives a folder (with contents) via an inline confirm (no browser confirm)", () => {
    const api = makeApi();
    const confirmSpy = vi.spyOn(window, "confirm");
    render(<Explorer api={api} onCollapse={() => {}} />);
    fireEvent.click(screen.getAllByTitle("Folder actions")[0]);
    fireEvent.click(screen.getByText("Archive (with contents)"));
    fireEvent.click(screen.getByTitle("Confirm archive"));
    expect(api.archiveFolder).toHaveBeenCalledWith("f1");
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("archives a concept via an inline confirm", () => {
    const api = makeApi();
    render(<Explorer api={api} onCollapse={() => {}} />);
    const row = screen.getByText(/Root concept/).closest('[role="treeitem"]') as HTMLElement;
    fireEvent.click(row.querySelector('[title="Concept actions"]') as HTMLElement);
    fireEvent.click(screen.getByText("Archive (with layouts)"));
    fireEvent.click(screen.getByTitle("Confirm archive"));
    expect(api.archiveConcept).toHaveBeenCalledWith("cpt1");
  });

  it("archives a layout from its row button", () => {
    const api = makeApi();
    render(<Explorer api={api} onCollapse={() => {}} />);
    const rootRow = screen.getByText(/Root layout/).closest('[role="treeitem"]') as HTMLElement;
    fireEvent.click(rootRow.querySelector(".tree-archive") as HTMLElement);
    expect(api.archiveCell).toHaveBeenCalledWith("c1");
  });
});
