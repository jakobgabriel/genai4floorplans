import { useCallback, useEffect, useState } from "react";
import { adminApi, type Role, type TeamSummary, type TeamDetail, type WorkspaceSummary, type User } from "../admin/adminApi";
import { navigate } from "../store/useHashRoute";
import { useToast } from "../components/ui";
import { TEAL, TEXTD } from "../components/colors";

const ROLES: Role[] = ["OWNER", "EDITOR", "VIEWER"];

// Admin console for setting up teams, members and workspaces against the cloud
// backend. Gated by a light email/password sign-in; the editor stays offline.
export function AdminPage() {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = checking

  useEffect(() => {
    adminApi.me().then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);

  const head = (
    <div className="page-head">
      <button className="btn sm" onClick={() => navigate("/")}>← Editor</button>
      <h1 className="page-title">Admin · teams &amp; workspaces</h1>
      {user ? (
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", color: TEXTD, fontSize: 12 }}>
          {user.email}
          <button className="btn sm" onClick={() => adminApi.logout().then(() => setUser(null))}>Sign out</button>
        </span>
      ) : null}
    </div>
  );

  if (user === undefined) return <div className="page">{head}<p style={{ color: TEXTD }}>Checking session…</p></div>;
  if (user === null) return <div className="page">{head}<SignIn onSignedIn={setUser} toast={toast} /></div>;
  return <div className="page">{head}<Console toast={toast} /></div>;
}

function SignIn({ onSignedIn, toast }: { onSignedIn: (u: User) => void; toast: (m: string, k?: "info" | "warn") => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const r = mode === "login" ? await adminApi.login(email, password) : await adminApi.register(email, password, name || undefined);
      onSignedIn(r.user);
    } catch (e) {
      toast((e as Error).message, "warn");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chart-card" style={{ maxWidth: 380 }}>
      <div className="layoutTitle">{mode === "login" ? "Sign in" : "Create an account"}</div>
      {mode === "register" ? (
        <div className="field"><label>Name (optional)</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
      ) : null}
      <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
      <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn on" disabled={busy || !email || password.length < 8} onClick={submit}>
          {mode === "login" ? "Sign in" : "Register"}
        </button>
        <button className="btn sm" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account?" : "Have an account?"}
        </button>
      </div>
      <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 8 }}>Password must be at least 8 characters. Sign-in is only needed for the admin console — the editor works offline.</div>
    </div>
  );
}

function Console({ toast }: { toast: (m: string, k?: "info" | "warn") => void }) {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [newTeam, setNewTeam] = useState("");

  const fail = useCallback((e: unknown) => toast((e as Error).message, "warn"), [toast]);

  const loadTeams = useCallback(() => adminApi.listTeams().then((r) => setTeams(r.teams)).catch(fail), [fail]);
  useEffect(() => { loadTeams(); }, [loadTeams]);

  const select = useCallback((id: string) => {
    setSel(id);
    adminApi.getTeam(id).then((r) => setDetail(r.team)).catch(fail);
    adminApi.listWorkspaces(id).then((r) => setWorkspaces(r.workspaces)).catch(fail);
  }, [fail]);

  const reloadDetail = useCallback(() => { if (sel) select(sel); }, [sel, select]);

  return (
    <div className="admin-grid">
      <div className="chart-card">
        <div className="layoutTitle">Teams</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input placeholder="New team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
          <button className="btn sm" disabled={!newTeam.trim()} onClick={() => adminApi.createTeam(newTeam.trim()).then(() => { setNewTeam(""); loadTeams(); }).catch(fail)}>Add</button>
        </div>
        {teams.length === 0 ? <p style={{ color: TEXTD, fontSize: 12 }}>No teams yet — create one (you become its owner).</p> : null}
        {teams.map((t) => (
          <button key={t.id} className={"btn sm" + (sel === t.id ? " on" : "")} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4 }} onClick={() => select(t.id)}>
            {t.name}
          </button>
        ))}
      </div>

      {sel && detail ? (
        <>
          <div className="chart-card">
            <div className="layoutTitle">Members · {detail.name}</div>
            <AddMember teamId={sel} onDone={reloadDetail} fail={fail} />
            <table className="schemaTbl">
              <thead><tr><th>Member</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {detail.memberships.map((m) => (
                  <tr key={m.userId}>
                    <td>{m.user.name || m.user.email}<div style={{ fontSize: 10, color: TEXTD }}>{m.user.email}</div></td>
                    <td>
                      <select value={m.role} onChange={(e) => adminApi.updateMember(sel, m.userId, e.target.value as Role).then(reloadDetail).catch(fail)}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td><button className="btn sm danger" onClick={() => adminApi.removeMember(sel, m.userId).then(reloadDetail).catch(fail)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="chart-card">
            <div className="layoutTitle">Workspaces · {detail.name}</div>
            <NewWorkspace teamId={sel} onDone={() => select(sel)} fail={fail} />
            {workspaces.length === 0 ? <p style={{ color: TEXTD, fontSize: 12 }}>No workspaces yet.</p> : null}
            {workspaces.map((w) => (
              <div key={w.id} style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ color: TEAL }}>▣</span> {w.name}
                <span style={{ fontSize: 10, color: TEXTD }}> · updated {new Date(w.updatedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="chart-card"><p style={{ color: TEXTD }}>Select a team to manage its members and workspaces.</p></div>
      )}
    </div>
  );
}

function AddMember({ teamId, onDone, fail }: { teamId: string; onDone: () => void; fail: (e: unknown) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EDITOR");
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      <input placeholder="member@email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1 }} />
      <select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
      <button className="btn sm" disabled={!email.trim()} onClick={() => adminApi.addMember(teamId, email.trim(), role).then(() => { setEmail(""); onDone(); }).catch(fail)}>Add</button>
    </div>
  );
}

function NewWorkspace({ teamId, onDone, fail }: { teamId: string; onDone: () => void; fail: (e: unknown) => void }) {
  const [name, setName] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      <input placeholder="New workspace name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
      <button className="btn sm" disabled={!name.trim()} onClick={() => adminApi.createWorkspace(teamId, name.trim()).then(() => { setName(""); onDone(); }).catch(fail)}>Add</button>
    </div>
  );
}
