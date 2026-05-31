// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the API client so the tests are deterministic (no global fetch / network
// timing, which leaks across files in the full suite).
vi.mock("../admin/adminApi", () => ({
  adminApi: {
    me: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    listTeams: vi.fn(),
    createTeam: vi.fn(),
    getTeam: vi.fn(),
    addMember: vi.fn(),
    updateMember: vi.fn(),
    removeMember: vi.fn(),
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
  },
}));

import { AdminPage } from "./AdminPage";
import { adminApi } from "../admin/adminApi";
import { ToastProvider } from "../components/ui";

const api = adminApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderAdmin() {
  return render(<ToastProvider><AdminPage /></ToastProvider>);
}

beforeEach(() => {
  cleanup();
  window.location.hash = "";
  Object.values(api).forEach((fn) => fn.mockReset());
});
afterEach(cleanup);

describe("AdminPage", () => {
  it("shows the sign-in form when not authenticated", async () => {
    api.me.mockRejectedValue(new Error("unauthorized"));
    renderAdmin();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
  });

  it("shows the console with teams when authenticated", async () => {
    api.me.mockResolvedValue({ user: { id: "u1", email: "a@b.com", name: "A" }, memberships: [] });
    api.listTeams.mockResolvedValue({ teams: [{ id: "t1", name: "Acme", createdAt: new Date().toISOString() }] });
    renderAdmin();
    // teams load a tick after the session, so wait for the team button itself
    await waitFor(() => expect(screen.getByRole("button", { name: "Acme" })).toBeTruthy());
    expect(screen.getByText("a@b.com")).toBeTruthy();
  });

  it("signs in via the login form", async () => {
    api.me.mockRejectedValue(new Error("unauthorized"));
    api.login.mockResolvedValue({ user: { id: "u1", email: "a@b.com", name: null } });
    api.listTeams.mockResolvedValue({ teams: [] });
    renderAdmin();
    await waitFor(() => screen.getByRole("button", { name: "Sign in" }));
    fireEvent.change(document.querySelector('input[type="email"]') as HTMLInputElement, { target: { value: "a@b.com" } });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText("a@b.com")).toBeTruthy());
    expect(api.login).toHaveBeenCalledWith("a@b.com", "longenough");
  });

  it("creates a team from the console", async () => {
    api.me.mockResolvedValue({ user: { id: "u1", email: "a@b.com", name: "A" }, memberships: [] });
    api.listTeams.mockResolvedValue({ teams: [] });
    api.createTeam.mockResolvedValue({ team: { id: "t2", name: "New Co", createdAt: new Date().toISOString() } });
    renderAdmin();
    await waitFor(() => screen.getByText("a@b.com"));
    fireEvent.change(screen.getByPlaceholderText("New team name"), { target: { value: "New Co" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(api.createTeam).toHaveBeenCalledWith("New Co"));
  });
});
