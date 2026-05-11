import type { JSX } from "react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, authFetch } from "../api/authFetch";
import type { BackendTemplateDetails } from "../datasheet/sheetTemplateMode";
import { buildHumanReadableDatasheetCsv } from "../datasheet/sessionDatasheetCsv";
import { ClientDatasheetPreview, type SessionEntryView, type SessionViewModel } from "./ClientDatasheetPreview";

function downloadCsv(filename: string, csvBody: string): void {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvBody], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

// Shared style constants to match other pages
const card: React.CSSProperties = { background: "white", border: "1px solid #ccc", padding: 20, marginBottom: 16 };
const btnPrimary: React.CSSProperties = { padding: "8px 18px", border: "none", background: "#4a7c6f", color: "white", cursor: "pointer", fontSize: 13 };
const inp: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1px solid #ccc", fontSize: 13, boxSizing: "border-box" };
const sel: React.CSSProperties = { ...inp, background: "white" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#444" };

function Sidebar({
  user,
  navigate,
  active,
}: {
  user: User;
  navigate: (path: string) => void;
  active: "dashboard" | "data-entry" | "intervention" | "review" | "client-datasheets";
}) {
  const navItems: { label: string; path: string | null }[] = [
    { label: "Dashboard", path: "/dashboard" },
    { label: "Data Entry", path: "/data-entry" },
    { label: "Intervention", path: "/intervention" },
  ];
  if (user.role !== "dsp") {
    navItems.push({ label: "Graphs", path: "/review" });
    navItems.push({ label: "Client Datasheets", path: "/client-datasheets" });
  }
  if (user.role === "bcba") {
    navItems.push({ label: "Employees", path: null });
  }

  function itemIsActive(label: string): boolean {
    if (label === "Data Entry") return active === "data-entry";
    if (label === "Intervention") return active === "intervention";
    if (label === "Graphs") return active === "review";
    if (label === "Client Datasheets") return active === "client-datasheets";
    if (label === "Dashboard" || label === "Clients") return active === "dashboard";
    return false;
  }

  return (
    <aside style={{ width: 200, background: "#5b8278", color: "white", padding: 16, display: "flex", flexDirection: "column", gap: 4, fontFamily: "Arial, sans-serif", flexShrink: 0 }}>
      <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #4a5e56" }}>Observa</div>
      {navItems.map((item) => {
        const isActive = itemIsActive(item.label);
        return (
          <button key={item.label}
            style={{
              background: isActive ? "rgba(255,255,255,0.15)" : "none",
              border: "none",
              color: isActive ? "white" : "rgba(255,255,255,0.6)",
              padding: "8px 10px",
              cursor: item.path ? "pointer" : "default",
              textAlign: "left",
              width: "100%",
              fontSize: 13,
              borderRadius: 4,
              opacity: item.path ? 1 : 0.45,
            }}
            onClick={() => item.path && navigate(item.path)}>
            {item.label}
          </button>
        );
      })}
    </aside>
  );
}

type Role = "bcba" | "rbt" | "dsp";
interface User { id: number; username: string; role: Role; }

function getCurrentUser(): User {
  const role = (localStorage.getItem("role") ?? "dsp") as Role;
  const username = localStorage.getItem("username") ?? "user";
  const id = Number(localStorage.getItem("userId") ?? "1");
  return { id, username, role };
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
}

interface Session extends SessionViewModel {
  data_collector_id: string;
  data_collector_name: string;
  entries: SessionEntryView[];
}

interface DataSheetTemplate {
  id: string;
  name: string;
  description: string | null;
}

export default function ClientDatasheets(): JSX.Element {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [templates, setTemplates] = useState<DataSheetTemplate[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [templateDetail, setTemplateDetail] = useState<BackendTemplateDetails | null>(null);
  const [templateDetailError, setTemplateDetailError] = useState("");
  const [behaviorIdToName, setBehaviorIdToName] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (user.role === "dsp") {
      navigate("/dashboard", { replace: true });
      return;
    }

    loadClients();
    loadTemplates();
  }, [user.role, navigate]);

  useEffect(() => {
    if (clients.length === 0) return;
    const q = searchParams.get("client");
    if (q && clients.some((c) => c.id === q)) {
      setSelectedClientId(q);
      return;
    }
    setSelectedClientId((prev) => (prev ? prev : clients[0]!.id));
  }, [clients, searchParams]);

  useEffect(() => {
    if (selectedClientId) {
      loadClientSessions(selectedClientId);
    }
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/datasheet/behaviors/`);
        if (!res.ok || cancelled) return;
        const all = (await res.json()) as { id: string; client_id: string; name: string }[];
        const map = new Map<string, string>();
        for (const b of all) {
          if (b.client_id === selectedClientId) map.set(b.id, b.name);
        }
        if (!cancelled) setBehaviorIdToName(map);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedSession?.template) {
      setTemplateDetail(null);
      setTemplateDetailError("");
      return;
    }
    let cancelled = false;
    (async () => {
      setTemplateDetailError("");
      try {
        const res = await authFetch(`${API_BASE}/datasheet/templates/${selectedSession.template}/`);
        if (!res.ok) throw new Error("Failed to load template");
        const data = (await res.json()) as BackendTemplateDetails;
        if (!cancelled) setTemplateDetail(data);
      } catch {
        if (!cancelled) {
          setTemplateDetail(null);
          setTemplateDetailError("Could not load the sheet layout. Summary and behavior names still show below.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSession?.id, selectedSession?.template]);

  const loadClients = async () => {
    try {
      const res = await authFetch(`${API_BASE}/clients/profiles/`);
      if (!res.ok) throw new Error("Failed to load clients");
      const data = await res.json();
      setClients(data);
    } catch (err) {
      console.error("Failed to load clients:", err);
    }
  };

  const loadTemplates = async () => {
    try {
      const res = await authFetch(`${API_BASE}/datasheet/templates/`);
      if (!res.ok) throw new Error("Failed to load templates");
      const data = await res.json();
      setTemplates(data);
    } catch (err) {
      console.error("Failed to load templates:", err);
    }
  };

  const loadClientSessions = async (clientId: string) => {
    setLoading(true);
    try {
      setError("");
      const res = await authFetch(`${API_BASE}/datasheet/sessions/`);
      if (!res.ok) throw new Error("Failed to load sessions");
      const allSessions = await res.json();
      const clientSessions = allSessions.filter((s: Session) => s.client_id === clientId);
      setSessions(
        clientSessions.sort(
          (a: Session, b: Session) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        ),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    setSelectedSession(null);
    if (searchParams.has("client")) {
      setSearchParams({}, { replace: true });
    }
  };

  const viewSession = (session: Session) => {
    setSelectedSession(session);
  };

  const exportToCsv = (session: Session) => {
    const client = clients.find((c) => c.id === session.client_id);
    const clientDisplayName = client ? `${client.first_name} ${client.last_name}`.trim() : "Unknown client";
    const dateIso = session.date.slice(0, 10);
    const body = buildHumanReadableDatasheetCsv({
      session,
      templateDetails: templateDetail,
      templateListName: templates.find((t) => t.id === session.template)?.name ?? "Default",
      behaviorIdToName,
      clientDisplayName,
      dataCollectorName: session.data_collector_name,
    });
    const safeId =
      session.session_identifier.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 48) || "session";
    downloadCsv(`datasheet-${safeId}-${dateIso}.csv`, body);
  };

  if (user.role === "dsp") return <div>Redirecting...</div>;

  return (
    <div style={{ fontFamily: "Arial, sans-serif", display: "flex", minHeight: "100vh" }}>
      <Sidebar user={user} navigate={navigate} active="client-datasheets" />
      <main style={{ flex: 1, padding: 24, background: "#f5f5f5" }}>
        {/* breadcrumb */}
        <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
          <span style={{ color: "#4a7c6f", cursor: "pointer" }} onClick={() => navigate("/dashboard")}>Dashboard</span>
          {" › "}
          <span>Client Datasheets</span>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>Client Datasheets</h1>
        <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>View and export previous data sheets</p>

        {error ? (
          <p style={{ color: "#b0471c", fontSize: 13, marginBottom: 16 }} role="alert">
            {error}
          </p>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* left col */}
          <div>
            <div style={card}>
              <h3 style={{ marginBottom: 14, fontSize: 14 }}>Select Client</h3>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Client</label>
                <select
                  style={sel}
                  value={selectedClientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                >
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.first_name} {client.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={card}>
              <h3 style={{ marginBottom: 14, fontSize: 14 }}>Previous Data Sheets</h3>
              {loading ? (
                <p style={{ color: "#666" }}>Loading sessions...</p>
              ) : sessions.length === 0 ? (
                <p style={{ color: "#666" }}>No data sheets found for this client.</p>
              ) : (
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => viewSession(session)}
                      style={{
                        padding: "12px",
                        border: "1px solid #eee",
                        borderRadius: 4,
                        marginBottom: 8,
                        cursor: "pointer",
                        background: selectedSession?.id === session.id ? "#e8f5f0" : "white",
                        transition: "background 0.2s"
                      }}
                    >
                      <div style={{ fontWeight: "bold", fontSize: 14 }}>
                        {session.session_identifier}
                      </div>
                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        {new Date(session.date).toLocaleDateString()}
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {session.data_collector_name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* right col */}
          <div>
            {selectedSession ? (
              <div>
                <div style={{ ...card, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ margin: 0, fontSize: 16 }}>
                      Data Sheet: {selectedSession.session_identifier}
                    </h2>
                    <button type="button" onClick={() => exportToCsv(selectedSession)} style={btnPrimary}>
                      Download CSV
                    </button>
                  </div>
                </div>
                {templateDetailError ? (
                  <p style={{ color: "#b0471c", fontSize: 12, marginBottom: 12 }} role="status">
                    {templateDetailError}
                  </p>
                ) : null}
                <ClientDatasheetPreview
                  session={selectedSession}
                  templateDetails={templateDetail}
                  templateListName={templates.find((t) => t.id === selectedSession.template)?.name ?? "Default"}
                  behaviorIdToName={behaviorIdToName}
                  clientDisplayName={(() => {
                    const c = clients.find((x) => x.id === selectedSession.client_id);
                    return c ? `${c.first_name} ${c.last_name}`.trim() : "Unknown client";
                  })()}
                  dataCollectorName={selectedSession.data_collector_name}
                />
              </div>
            ) : (
              <div style={card}>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Select a data sheet</h3>
                <p style={{ color: "#666", fontSize: 13 }}>Choose a client from the left panel and click on any previous data sheet to view its detailed information.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

