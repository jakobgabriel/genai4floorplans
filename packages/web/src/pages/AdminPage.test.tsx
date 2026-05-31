// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdminPage } from "./AdminPage";
import { ToastProvider } from "../components/ui";

function renderAdmin() {
  return render(<ToastProvider><AdminPage /></ToastProvider>);
}

// Build a fetch stub from a route table keyed by "METHOD /path".
function stub(routes: Record<string, { status?: number; body?: unknown }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url).replace(/^\/api/, "")}`;
    const r = routes[key];
    if (!r) return { ok: false, status: 404, async json() { return { error: "not found" }; } } as unknown as Response;
    const status = r.status ?? 200;
    return { ok: status < 400, status, async json() { return r.body ?? {}; } } as unknown as Response;
  });
}

beforeEach(() => { cleanup(); window.location.hash = ""; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("AdminPage", () => {
  it("shows the sign-in form when not authenticated", async () => {
    vi.stubGlobal("fetch", stub({ "GET /auth/me": { status: 401, body: { error: "unauthorized" } } }));
    renderAdmin();
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
  });

  it("shows the console with teams when authenticated", async () => {
    vi.stubGlobal("fetch", stub({
      "GET /auth/me": { body: { user: { id: "u1", email: "a@b.com", name: "A" }, memberships: [] } },
      "GET /teams": { body: { teams: [{ id: "t1", name: "Acme", createdAt: new Date().toISOString() }] } },
    }));
    renderAdmin();
    await waitFor(() => expect(screen.getByText("a@b.com")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Acme" })).toBeTruthy();
  });

  it("signs in via the login form", async () => {
    const fetchMock = stub({
      "GET /auth/me": { status: 401, body: { error: "unauthorized" } },
      "POST /auth/login": { body: { user: { id: "u1", email: "a@b.com", name: null } } },
      "GET /teams": { body: { teams: [] } },
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAdmin();
    await waitFor(() => screen.getByRole("button", { name: "Sign in" }));
    fireEvent.change(document.querySelector('input[type="email"]') as HTMLInputElement, { target: { value: "a@b.com" } });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "longenough" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.getByText("a@b.com")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST" }));
  });
});
