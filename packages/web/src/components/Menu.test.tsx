// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { Menu } from "./Menu";

afterEach(cleanup);

describe("Menu", () => {
  it("announces the popup and its open state, and toggles it", () => {
    render(<Menu label="Export" items={[{ label: "Export JSON", onClick: () => {} }]} />);
    const toggle = screen.getByRole("button", { name: "Export" });
    // A menu trigger reports haspopup + expanded, not a bare aria-pressed.
    expect(toggle.getAttribute("aria-haspopup")).toBe("menu");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Export JSON" })).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menuitem")).toBeNull();
  });
});
