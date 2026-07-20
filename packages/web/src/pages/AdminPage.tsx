import { useCallback, useEffect, useState } from "react";
import { Button, Tile, StructuredListWrapper, StructuredListHead, StructuredListBody, StructuredListRow, StructuredListCell } from "@carbon/react";
import { ArrowLeft, TrashCan, Workspace } from "@carbon/icons-react";
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
      <Button size="sm" kind="ghost" renderIcon={ArrowLeft} onClick={() => navigate("/")}>Editor</Button>
      <h1 className="page-title">Admin · teams &amp; workspaces</h1>
      {user ? (
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", color: TEXTD, fontSize: 12 }}>
          {user.email}
          <Button size="sm" kind="tertiary" onClick={() => adminApi.logout().then(() => setUser(null))}>Sign out</Button>
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
    <Tile className="bi-card" style={{ maxWidth: 380 }}>
      <div className="bi-card__head"><h3 className="bi-card__title">{mode === "login" ? "Sign in" : "Create an account"}</h3></div>
      {mode === "register" ? (
        <div className="field"><label>Name (optional)</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
      ) : null}
      <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
      <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button size="sm" kind="primary" disabled={busy || !email || password.length < 8} onClick={submit}>
          {mode === "login" ? "Sign in" : "Register"}
        </Button>
        <Button size="sm" kind="tertiary" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account?" : "Have an account?"}
        </Button>
      </div>
      <div style={{ fontSize: 10.5, color: TEXTD, marginTop: 8 }}>Password must be at least 8 characters. Sign-in is only needed for the admin console — the editor works offline.</div>
    </Tile>
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
      <Tile className="bi-card">
        <div className="bi-card__head"><h3 className="bi-card__title">Teams</h3></div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <input placeholder="New team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} />
          <Button size="sm" kind="tertiary" disabled={!newTeam.trim()} onClick={() => adminApi.createTeam(newTeam.trim()).then(() => { setNewTeam(""); loadTeams(); }).catch(fail)}>Add</Button>
        </div>
        {teams.length === 0 ? <p style={{ color: TEXTD, fontSize: 12 }}>No teams yet — create one (you become its owner).</p> : null}
        {teams.map((t) => (
          <Button key={t.id} size="sm" kind={sel === t.id ? "primary" : "tertiary"} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 4 }} onClick={() => select(t.id)}>
            {t.name}
          </Button>
        ))}
      </Tile>

      {sel && detail ? (
        <>
          <Tile className="bi-card">
            <div className="bi-card__head"><h3 className="bi-card__title">Members · {detail.name}</h3></div>
            <AddMember teamId={sel} onDone={reloadDetail} fail={fail} />
            <StructuredListWrapper isCondensed>
              <StructuredListHead><StructuredListRow head><StructuredListCell head>Member</StructuredListCell><StructuredListCell head>Role</StructuredListCell><StructuredListCell head></StructuredListCell></StructuredListRow></StructuredListHead>
              <StructuredListBody>
                {detail.memberships.map((m) => (
                  <StructuredListRow key={m.userId}>
                    <StructuredListCell>{m.user.name || m.user.email}<div style={{ fontSize: 10, color: TEXTD }}>{m.user.email}</div></StructuredListCell>
                    <StructuredListCell>
                      <select value={m.role} onChange={(e) => adminApi.updateMember(sel, m.userId, e.target.value as Role).then(reloadDetail).catch(fail)}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </StructuredListCell>
                    <StructuredListCell><Button size="sm" kind="danger--tertiary" renderIcon={TrashCan} hasIconOnly={false} onClick={() => adminApi.removeMember(sel, m.userId).then(reloadDetail).catch(fail)}>Remove</Button></StructuredListCell>
                  </StructuredListRow>
                ))}
              </StructuredListBody>
            </StructuredListWrapper>
          </Tile>

          <Tile className="bi-card">
            <div className="bi-card__head"><h3 className="bi-card__title">Workspaces · {detail.name}</h3></div>
            <NewWorkspace teamId={sel} onDone={() => select(sel)} fail={fail} />
            {workspaces.length === 0 ? <p style={{ color: TEXTD, fontSize: 12 }}>No workspaces yet.</p> : null}
            {workspaces.map((w) => (
              <div key={w.id} style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                <Workspace size={14} style={{ verticalAlign: "-2px", marginRight: 4, color: TEAL }} /> {w.name}
                <span style={{ fontSize: 10, color: TEXTD }}> · updated {new Date(w.updatedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </Tile>
        </>
      ) : (
        <Tile className="bi-card"><p style={{ color: TEXTD }}>Select a team to manage its members and workspaces.</p></Tile>
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
      <Button size="sm" kind="tertiary" disabled={!email.trim()} onClick={() => adminApi.addMember(teamId, email.trim(), role).then(() => { setEmail(""); onDone(); }).catch(fail)}>Add</Button>
    </div>
  );
}

function NewWorkspace({ teamId, onDone, fail }: { teamId: string; onDone: () => void; fail: (e: unknown) => void }) {
  const [name, setName] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
      <input placeholder="New workspace name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
      <Button size="sm" kind="tertiary" disabled={!name.trim()} onClick={() => adminApi.createWorkspace(teamId, name.trim()).then(() => { setName(""); onDone(); }).catch(fail)}>Add</Button>
    </div>
  );
}
