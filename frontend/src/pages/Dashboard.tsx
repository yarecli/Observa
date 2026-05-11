import type { JSX } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch, API_BASE } from "../api/authFetch";

type Role = "bcba" | "rbt" | "dsp";
interface User { id: number; username: string; role: Role; first_name: string; last_name: string }
interface Client { id: string; name: string; assignedTo: number[]; groupHomeTitle?: string; }
/** Backend client response from /api/clients/profiles/ */
interface BackendClient {
  id: string;  // UUID from backend
  first_name: string;
  last_name: string;
  /** Group home / residential label (Client.placement in the API). */
  placement?: string | null;
}
/** Backend caseload response from /api/clients/caseloads/ */
interface BackendCaseload {
  client: string;  // UUID string matching Client.id
  staff: number;
}
/** From GET /api/datasheet/templates/ (list may omit nested columns). */
interface ApiTemplateListItem {
  id: string;
  name: string;
  description?: string | null;
  is_system_template?: boolean;
}

// ─── Read user from localStorage (set during login) ───────────────────────────
function getCurrentUser(): User {
  const role = (localStorage.getItem("role") ?? "dsp") as Role;
  const username = localStorage.getItem("username") ?? "user";
  const id = Number(localStorage.getItem("userId") ?? "1");
  const first_name = localStorage.getItem("firstName") ?? "user";
  const last_name = localStorage.getItem("lastName") ?? "user";
  return { id, username, role, first_name, last_name };
}

const PERMISSIONS: Record<Role, Record<string, boolean>> = {
  bcba: {
    canAddClient: true,
    canRemoveClient: true,
    canManageTemplates: true,
    canManageEmployees: true,
    canViewAllClientData: true,
    canViewGraphs: true,
    canViewTemplatesSection: true,
  },
  rbt: {
    canAddClient: false,
    canRemoveClient: false,
    canManageTemplates: false,
    canManageEmployees: false,
    canViewAllClientData: false,
    canViewGraphs: true,
    canViewTemplatesSection: true,
  },
  dsp: {
    canAddClient: false,
    canRemoveClient: false,
    canManageTemplates: false,
    canManageEmployees: false,
    canViewAllClientData: false,
    canViewGraphs: false,
    canViewTemplatesSection: false,
  },
};

function hasAccess(client: Client, user: User): boolean {
  if (PERMISSIONS[user.role].canViewAllClientData) return true;
  return client.assignedTo.includes(user.id);
}

const S: Record<string, React.CSSProperties> = {
  page:        { display: "flex", minHeight: "100vh", fontFamily: "Arial, sans-serif", fontSize: 14 },
  sidebar:     { width: 200, background: "#5b8278", color: "white", padding: 16, display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 },
  sidebarTitle:{ fontWeight: "bold", fontSize: 16, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #4a5e56" },
  navBtn:      { background: "none", border: "none", color: "rgba(255,255,255,0.7)", padding: "8px 10px", cursor: "pointer", textAlign: "left", width: "100%", fontSize: 13, borderRadius: 4 },
  navBtnActive:{ background: "rgba(255,255,255,0.15)", color: "white" },
  logoutBtn:   { background: "none", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", padding: "7px 10px", cursor: "pointer", textAlign: "left", width: "100%", fontSize: 13, borderRadius: 4, marginTop: 6 },
  main:        { flex: 1, background: "#f5f5f5", padding: 24 },
  pageTitle:   { fontSize: 22, fontWeight: "bold", marginBottom: 20, color: "#5b8278" },
  section:     { marginBottom: 28 },
  sectionHdr:  { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle:{ fontWeight: "bold", fontSize: 16 },
  badge:       { background: "#4a7c6f", color: "white", padding: "2px 8px", fontSize: 12, borderRadius: 3 },
  addBtn:      { padding: "6px 14px", background: "white", border: "1px solid #ccc", cursor: "pointer", fontSize: 13 },
  grid:        { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 },
  card:        { background: "white", border: "1px solid #ccc", padding: 16, position: "relative" as const },
  cardName:    { fontWeight: "bold", marginBottom: 6, textAlign: "center" as const },
  cardActions: { display: "flex", gap: 6, flexWrap: "wrap" as const, position: "relative" as const },
  cardBtn:     { flex: 1, padding: "5px 4px", border: "1px solid #ccc", background: "#f9f9f9", cursor: "pointer", fontSize: 12 },
  cardBtnPrimary: { flex: 1, padding: "5px 4px", border: "1px solid #4a7c6f", background: "#4a7c6f", color: "white", cursor: "pointer", fontSize: 12 },
  lockBadge:   { fontSize: 11, color: "#999", textAlign: "center" as const, marginBottom: 8 },
  dropdown:    { position: "absolute" as const, top: "100%", left: 0, right: 0, background: "white", border: "1px solid #ccc", zIndex: 100 },
  dropdownOpt: { display: "block", width: "100%", padding: "8px 12px", border: "none", background: "none", cursor: "pointer", textAlign: "left" as const, fontSize: 13 },
  templateRow: { background: "white", border: "1px solid #ccc", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  modal:       { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 500 },
  modalBox:    { background: "white", padding: 24, width: 320, border: "1px solid #ccc" },
  input:       { width: "100%", padding: "8px", border: "1px solid #ccc", fontSize: 14, boxSizing: "border-box" as const, marginBottom: 12 },
  toast:       { position: "fixed" as const, bottom: 20, right: 20, padding: "10px 16px", background: "#5b8278", color: "white", fontSize: 13, zIndex: 999 },
  toastError:  { position: "fixed" as const, bottom: 20, right: 20, padding: "10px 16px", background: "#c0603a", color: "white", fontSize: 13, zIndex: 999 },
};

export default function Dashboard(): JSX.Element {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const perms = PERMISSIONS[user.role];

  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [templates, setTemplates] = useState<ApiTemplateListItem[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [search, setSearch] = useState("");
  // const [showAddClient, setShowAddClient] = useState(false);
  // const [newClientName, setNewClientName] = useState("");
  const [toast, setToast] = useState("");
  const [toastError, setToastError] = useState("");

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000); }
  function deny(msg = "Access denied.") { setToastError(msg); setTimeout(() => setToastError(""), 3000); }

  function handleLogout() {
    localStorage.clear();
    navigate("/");
  }

  // Load real clients from backend API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!localStorage.getItem("access") && !localStorage.getItem("refresh")) {
        setLoadingClients(false);
        return;
      }
      setLoadingClients(true);
      try {
        const [clientRes, caseloadRes] = await Promise.all([
          authFetch(`${API_BASE}/clients/profiles/`),
          authFetch(`${API_BASE}/clients/caseloads/`),
        ]);
        
        if (!clientRes.ok || !caseloadRes.ok || cancelled) {
          setLoadingClients(false);
          return;
        }
        
        const clientData = (await clientRes.json()) as unknown;
        const caseloadData = (await caseloadRes.json()) as unknown;
        
        if (!Array.isArray(clientData) || !Array.isArray(caseloadData) || cancelled) {
          setLoadingClients(false);
          return;
        }
        
        // Build a map of client ID -> staff IDs
        const staffByClient: Record<string, number[]> = {};
        caseloadData.forEach((row: BackendCaseload) => {
          if (!staffByClient[row.client]) {
            staffByClient[row.client] = [];
          }
          staffByClient[row.client].push(row.staff);
        });
        
        const mapped = clientData.map((row: BackendClient) => {
          const gh = row.placement?.trim();
          return {
            id: row.id,
            name: `${row.first_name} ${row.last_name}`.trim(),
            assignedTo: staffByClient[row.id] ?? [],
            ...(gh ? { groupHomeTitle: gh } : {}),
          };
        });
        setClients(mapped);
      } catch (err) {
        if (!cancelled) console.error("Failed to load clients:", err);
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // function submitNewClient() {
  //   if (!newClientName.trim()) return;
  //   setClients(prev => [
  //     ...prev,
  //     {
  //       id: `00000000-0000-0000-0000-${String(Date.now()).padStart(12, "0")}`,
  //       name: newClientName.trim(),
  //       assignedTo: [user.id],
  //     },
  //   ]);
  //   setNewClientName(""); setShowAddClient(false);
  //   notify("Client added.");
  // }

  async function deleteCustomTemplate(t: ApiTemplateListItem) {
    if (t.is_system_template) return;
    if (!window.confirm(`Delete custom template "${t.name}"? This cannot be undone.`)) return;
    try {
      const res = await authFetch(`${API_BASE}/datasheet/templates/${t.id}/`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        deny(err.detail ?? "Could not delete template.");
        return;
      }
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
      notify("Template deleted.");
    } catch {
      deny("Could not delete template.");
    }
  }

  useEffect(() => {
    if (!perms.canViewTemplatesSection) return;
    let cancelled = false;
    (async () => {
      if (!localStorage.getItem("access") && !localStorage.getItem("refresh")) return;
      setLoadingTemplates(true);
      try {
        const res = await authFetch(`${API_BASE}/datasheet/templates/`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data) || cancelled) return;
        setTemplates(
          data.map((row: Record<string, unknown>) => ({
            id: String(row.id ?? ""),
            name: String(row.name ?? "Untitled"),
            description: row.description != null ? String(row.description) : null,
            is_system_template: Boolean(row.is_system_template),
          })).filter((t) => t.id.length > 0)
        );
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [perms.canViewTemplatesSection]);

  const q = search.toLowerCase();
  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.groupHomeTitle?.toLowerCase().includes(q) ?? false),
  );

  const navItems = [
    { label: "Dashboard",  path: "/dashboard",  active: true,  locked: false },
    { label: "Data Entry", path: "/data-entry", active: false, locked: false },
    { label: "Intervention", path: "/intervention", active: false, locked: false },
    { label: "Graphs",     path: "/review",   active: false, locked: !perms.canViewGraphs },
    { label: "Client Datasheets", path: "/client-datasheets", active: false, locked: !perms.canViewGraphs },
  ];

  return (
    <>
      {toast      && <div style={S.toast}>{toast}</div>}
      {toastError && <div style={S.toastError}>{toastError}</div>}

      {/* {showAddClient && (
        <div style={S.modal} onClick={() => setShowAddClient(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Add New Client</h3>
            <input style={S.input} placeholder="Full name" value={newClientName}
              onChange={e => setNewClientName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submitNewClient()} autoFocus />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={S.addBtn} onClick={() => setShowAddClient(false)}>Cancel</button>
              <button style={{ ...S.addBtn, background: "#4a7c6f", color: "white", border: "1px solid #4a7c6f" }}
                onClick={submitNewClient} disabled={!newClientName.trim()}>Add</button>
            </div>
          </div>
        </div>
      )} */}

      <div style={S.page}>
        {/* sidebar */}
        <aside style={S.sidebar}>
          <div style={S.sidebarTitle}>Observa</div>
          {navItems.map(item => (
            <button key={item.label}
              style={{ ...S.navBtn, ...(item.active ? S.navBtnActive : {}), ...(item.locked ? { opacity: 0.4 } : {}) }}
              onClick={() => {
                if (item.locked) {
                  deny(
                    item.label === "Graphs"
                      ? "Graphs and review tools are not available for your role. Use Data Entry for session data."
                      : `Access denied: only BCBAs can access ${item.label}.`
                  );
                  return;
                }
                if (item.path) navigate(item.path);
              }}>
              {item.label}
            </button>
          ))}
          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #4a5e56" }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
            <div style={{ fontWeight: "bold", color: "white" }}>{user.first_name} {user.last_name}</div>
              {/* <div style={{ fontWeight: "bold", color: "white" }}>{user.username}</div> */}
              <div>{user.role.toUpperCase()}</div>
            </div>
            <button style={S.logoutBtn} onClick={handleLogout}>Sign Out</button>
          </div>
        </aside>

        {/* main */}
        <main style={S.main}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <h1 style={S.pageTitle}>Dashboard</h1>
            <input placeholder="Search clients..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: "6px 10px", border: "1px solid #ccc", fontSize: 13, marginLeft: "auto" }} />
          </div>

          {/* clients */}
          <div style={S.section}>
            <div style={S.sectionHdr}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={S.sectionTitle}>Clients</span>
                <span style={S.badge}>{loadingClients ? "..." : filtered.length}</span>
              </div>
              {/* <button style={S.addBtn}
                onClick={() => perms.canAddClient ? setShowAddClient(true) : deny("Only BCBAs can add clients.")}>
                + Add New Client
              </button> */}
            </div>

            {loadingClients ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#999" }}>Loading clients...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#999" }}>No clients found.</div>
            ) : (
            <div style={S.grid}>
              {filtered.map(client => {
                const access = hasAccess(client, user);
                return (
                  <div key={client.id} style={{ ...S.card, opacity: access ? 1 : 0.6 }}>
                    {perms.canRemoveClient && (
                      <button onClick={() => { setClients(prev => prev.filter(c => c.id !== client.id)); notify("Client removed."); }}
                        style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#999" }}>✕</button>
                    )}
                    <div style={S.cardName}>{client.name}</div>
                    {client.groupHomeTitle && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#5b8278",
                          textAlign: "center",
                          fontWeight: 600,
                          marginBottom: 8,
                          lineHeight: 1.35,
                        }}
                      >
                        {client.groupHomeTitle}
                      </div>
                    )}
                    {!access && <div style={S.lockBadge}>🔒 Not assigned</div>}
                    <div style={{ fontSize: 11, color: "#999", textAlign: "center", marginBottom: 10 }}>
                      {client.assignedTo.length} staff assigned
                    </div>
                    <div style={S.cardActions} onClick={e => e.stopPropagation()}>
                      <button style={S.cardBtn}
                        onClick={() => {
                          if (!access) { deny(`Not assigned to ${client.name}.`); return; }
                          if (!perms.canViewGraphs) {
                            deny("Client Datasheets and graphs are not available for your role. Open Data Entry to record a session.");
                            return;
                          }
                          navigate(`/client-datasheets?client=${encodeURIComponent(client.id)}`);
                        }}>
                        See Sheets
                      </button>
                      <button style={S.cardBtnPrimary}
                        onClick={() => {
                          if (!access) { deny(`Not assigned to ${client.name}.`); return; }
                          navigate(`/data-entry?clientId=${client.id}`);
                        }}>
                        Add Sheet
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>

          {/* templates — BCBAs manage; RBTs see list only; DSPs use Data Entry from client cards */}
          {perms.canViewTemplatesSection && (
          <div style={S.section}>
            <div style={S.sectionHdr}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={S.sectionTitle}>Templates</span>
                <span style={S.badge}>{templates.length}</span>
              </div>
            </div>
            {loadingTemplates && (
              <p style={{ fontSize: 13, color: "#666" }}>Loading templates…</p>
            )}
            {!loadingTemplates && templates.length === 0 && (
              <p style={{ fontSize: 13, color: "#666" }}>
                No templates yet. Use Data Entry to build a sheet or run the backend seed command for examples.
              </p>
            )}
            {templates.map((t) => (
              <div key={t.id} style={S.templateRow}>
                <div>
                  <div style={{ fontWeight: "bold" }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {t.is_system_template ? "System template" : "Custom template"}
                    {t.description && String(t.description).trim() !== "" ? ` — ${t.description}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  {perms.canManageTemplates && t.is_system_template === false && (
                    <button
                      type="button"
                      style={{
                        ...S.addBtn,
                        color: "#a33",
                        borderColor: "#d4a8a8",
                        background: "#fff8f8",
                      }}
                      onClick={() => deleteCustomTemplate(t)}
                    >
                      Delete
                    </button>
                  )}
                  <button style={S.addBtn}
                    onClick={() => navigate(`/data-entry?template=${encodeURIComponent(t.id)}`)}>
                    Open in Data Entry
                  </button>
                </div>
              </div>
            ))}
          </div>
          )}
        </main>
      </div>
    </>
  );
}

