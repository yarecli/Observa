import type { FormEvent, JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { CSSProperties } from "react";
import { authFetch, API_BASE } from "../api/authFetch";
import { parseDrfError } from "../api/parseDrfError";

type Role = "bcba" | "rbt" | "dsp";
interface User {
  id: number;
  username: string;
  role: Role;
}
interface Client {
  id: string;
  name: string;
  assignedTo: number[];
}
interface BackendClient {
  id: string;
  first_name: string;
  last_name: string;
}
interface BackendCaseload {
  client: string;
  staff: number;
}
interface SessionRow {
  id: string;
  client_id: string;
  date: string;
  session_identifier: string;
  session_number: number | null;
}
interface InterventionRow {
  id: string;
  client_id: string;
  precedes_session: string;
  label: string;
  description: string;
  created_at: string;
}

const MOCK_CLIENTS: Client[] = [
  { id: "00000000-0000-0000-0000-000000000001", name: "Alex Johnson", assignedTo: [1, 2] },
  { id: "00000000-0000-0000-0000-000000000002", name: "Maria Garcia", assignedTo: [1, 3] },
];

function getCurrentUser(): User {
  const role = (localStorage.getItem("role") ?? "dsp") as Role;
  const username = localStorage.getItem("username") ?? "user";
  const id = Number(localStorage.getItem("userId") ?? "1");
  return { id, username, role };
}

function formatSessionOptionLabel(s: SessionRow): string {
  const d = new Date(s.date);
  const dateStr = Number.isNaN(d.getTime())
    ? s.date
    : `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  const name = s.session_identifier?.trim();
  if (name) return `${name} — ${dateStr}`;
  if (s.session_number != null) return `Session ${s.session_number} — ${dateStr}`;
  return dateStr;
}

const inp: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid #ccc",
  fontSize: 13,
  boxSizing: "border-box",
};
const sel: CSSProperties = { ...inp, background: "white" };
const lbl: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: "bold",
  marginBottom: 4,
  color: "#444",
};
const card: CSSProperties = { background: "white", border: "1px solid #ccc", padding: 20, marginBottom: 16 };
const btnPrimary: CSSProperties = {
  padding: "8px 18px",
  border: "none",
  background: "#4a7c6f",
  color: "white",
  cursor: "pointer",
  fontSize: 13,
};
const btnDanger: CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #c0603a",
  background: "#fff",
  color: "#c0603a",
  cursor: "pointer",
  fontSize: 12,
};
const logoutBtn: CSSProperties = {
  background: "none",
  border: "1px solid rgba(255,255,255,0.2)",
  color: "rgba(255,255,255,0.6)",
  padding: "7px 10px",
  cursor: "pointer",
  textAlign: "left",
  width: "100%",
  fontSize: 13,
  borderRadius: 4,
  marginTop: 6,
};

function Sidebar({
  user,
  navigate,
  active,
}: {
  user: User;
  navigate: (path: string) => void;
  active: "dashboard" | "data-entry" | "intervention" | "review";
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
    if (label === "Dashboard" || label === "Clients") return active === "dashboard";
    return false;
  }

  return (
    <aside
      style={{
        width: 200,
        background: "#5b8278",
        color: "white",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontFamily: "Arial, sans-serif",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontWeight: "bold",
          fontSize: 16,
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: "1px solid #4a5e56",
        }}
      >
        Observa
      </div>
      {navItems.map((item) => {
        const isActive = itemIsActive(item.label);
        return (
          <button
            key={item.label}
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
            onClick={() => item.path && navigate(item.path)}
          >
            {item.label}
          </button>
        );
      })}
    </aside>
  );
}

export default function Intervention(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = getCurrentUser();

  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [selectedClient, setSelectedClient] = useState(searchParams.get("clientId") ?? "");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [interventions, setInterventions] = useState<InterventionRow[]>([]);
  const [loadingInterventions, setLoadingInterventions] = useState(false);

  const [precedesSessionId, setPrecedesSessionId] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [saveToast, setSaveToast] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!localStorage.getItem("access") && !localStorage.getItem("refresh")) {
        setClients(MOCK_CLIENTS);
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
          setClients(MOCK_CLIENTS);
          setLoadingClients(false);
          return;
        }
        const clientData = (await clientRes.json()) as unknown;
        const caseloadData = (await caseloadRes.json()) as unknown;
        if (!Array.isArray(clientData) || !Array.isArray(caseloadData) || cancelled) {
          setClients(MOCK_CLIENTS);
          setLoadingClients(false);
          return;
        }
        const staffByClient: Record<string, number[]> = {};
        (caseloadData as BackendCaseload[]).forEach((row) => {
          if (!staffByClient[row.client]) staffByClient[row.client] = [];
          staffByClient[row.client]!.push(row.staff);
        });
        const mapped = (clientData as BackendClient[]).map((row) => ({
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          assignedTo: staffByClient[row.id] ?? [],
        }));
        setClients(mapped);
      } catch {
        if (!cancelled) setClients(MOCK_CLIENTS);
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clientSessionsSorted = useMemo(() => {
    return [...sessions]
      .filter((s) => s.client_id === selectedClient)
      .sort((a, b) => {
        const aNum = a.session_number ?? Number.MAX_SAFE_INTEGER;
        const bNum = b.session_number ?? Number.MAX_SAFE_INTEGER;
        if (aNum !== bNum) return aNum - bNum;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
  }, [sessions, selectedClient]);

  useEffect(() => {
    if (!selectedClient) {
      setSessions([]);
      setInterventions([]);
      setPrecedesSessionId("");
      return;
    }
    let cancelled = false;
    (async () => {
      if (!localStorage.getItem("access") && !localStorage.getItem("refresh")) {
        setSessions([]);
        setInterventions([]);
        return;
      }
      setLoadingSessions(true);
      setLoadingInterventions(true);
      try {
        const [sessRes, invRes] = await Promise.all([
          authFetch(`${API_BASE}/datasheet/sessions/`),
          authFetch(`${API_BASE}/datasheet/interventions/?client_id=${encodeURIComponent(selectedClient)}`),
        ]);
        if (cancelled) return;
        if (sessRes.ok) {
          const all = (await sessRes.json()) as SessionRow[];
          setSessions(Array.isArray(all) ? all : []);
        } else {
          setSessions([]);
        }
        if (invRes.ok) {
          const inv = (await invRes.json()) as InterventionRow[];
          setInterventions(Array.isArray(inv) ? inv : []);
        } else {
          setInterventions([]);
        }
      } catch {
        if (!cancelled) {
          setSessions([]);
          setInterventions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingSessions(false);
          setLoadingInterventions(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClient]);

  useEffect(() => {
    if (!precedesSessionId && clientSessionsSorted.length > 0) {
      setPrecedesSessionId(clientSessionsSorted[0]!.id);
    }
    if (
      precedesSessionId &&
      clientSessionsSorted.length > 0 &&
      !clientSessionsSorted.some((s) => s.id === precedesSessionId)
    ) {
      setPrecedesSessionId(clientSessionsSorted[0]!.id);
    }
  }, [clientSessionsSorted, precedesSessionId]);

  const clientName = clients.find((c) => c.id === selectedClient)?.name;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaveToast("");
    if (!selectedClient) {
      setFormError("Select a client.");
      return;
    }
    if (!precedesSessionId) {
      setFormError("Select which session the intervention comes before (needs at least one saved session).");
      return;
    }
    const t = label.trim();
    if (!t) {
      setFormError("Enter a short label for the graph.");
      return;
    }
    if (!localStorage.getItem("access") && !localStorage.getItem("refresh")) {
      setFormError("You are not logged in.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(`${API_BASE}/datasheet/interventions/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: selectedClient,
          precedes_session: precedesSessionId,
          label: t,
          description: description.trim(),
        }),
      });
      if (!res.ok) {
        const raw = await res.text();
        let parsed: unknown = {};
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          parsed = {};
        }
        const msg =
          parseDrfError(parsed) ||
          (raw && raw.length < 400 ? raw : "") ||
          `Request failed (${res.status}). If this persists, run Django migrations (intervention table).`;
        throw new Error(msg || "Could not save intervention.");
      }
      const created = (await res.json()) as InterventionRow;
      setInterventions((prev) => [...prev, created]);
      setLabel("");
      setDescription("");
      setSaveToast("Intervention saved. It will appear on graphs for this client.");
      setTimeout(() => setSaveToast(""), 4000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this intervention line from graphs?")) return;
    try {
      const res = await authFetch(`${API_BASE}/datasheet/interventions/${id}/`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete.");
      setInterventions((prev) => prev.filter((i) => i.id !== id));
    } catch {
      window.alert("Delete failed. Try again.");
    }
  }

  return (
    <div style={{ fontFamily: "Arial, sans-serif", display: "flex", minHeight: "100vh" }}>
      <Sidebar user={user} navigate={navigate} active="intervention" />
      <main style={{ flex: 1, padding: 24, background: "#f5f5f5" }}>
        <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
          <span style={{ color: "#4a7c6f", cursor: "pointer" }} onClick={() => navigate("/dashboard")}>
            Dashboard
          </span>
          {" › "}
          <span>Intervention</span>
          {clientName && (
            <>
              {" › "}
              <strong style={{ color: "#333" }}>{clientName}</strong>
            </>
          )}
        </div>

        <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>Intervention</h1>
        <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>
          Add a vertical marker on session graphs (between the prior session and the one you select). Same layout as data
          entry — pick a client, then the first session <em>after</em> the change.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 960 }}>
          <form style={card} onSubmit={(e) => void handleSubmit(e)}>
            <h3 style={{ marginBottom: 14, fontSize: 14 }}>Intervention details</h3>

            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>
                Client * {loadingClients && <span style={{ fontSize: 12, color: "#999" }}>(Loading...)</span>}
              </label>
              <select
                style={sel}
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                disabled={loadingClients}
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>
                Show line before session *{" "}
                {loadingSessions && <span style={{ fontSize: 12, color: "#999" }}>(Loading sessions...)</span>}
              </label>
              <select
                style={sel}
                value={precedesSessionId}
                onChange={(e) => setPrecedesSessionId(e.target.value)}
                disabled={!selectedClient || clientSessionsSorted.length === 0}
              >
                {clientSessionsSorted.length === 0 ? (
                  <option value="">No sessions yet — save a session in Data Entry first</option>
                ) : (
                  clientSessionsSorted.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatSessionOptionLabel(s)}
                    </option>
                  ))
                )}
              </select>
              <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                The dashed line appears at this session&apos;s column (between the previous session and this one).
              </p>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Label on graph *</label>
              <input
                style={inp}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. FCT introduced"
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Notes (optional)</label>
              <textarea
                style={{ ...inp, minHeight: 72, resize: "vertical" as const }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional detail for your records"
              />
            </div>

            {formError && <p style={{ color: "#b0471c", fontSize: 12, marginBottom: 8 }}>{formError}</p>}
            {saveToast && <p style={{ color: "#4a7c6f", fontSize: 12, marginBottom: 8 }}>{saveToast}</p>}

            <button type="submit" style={btnPrimary} disabled={submitting || clientSessionsSorted.length === 0}>
              {submitting ? "Saving…" : "Save intervention"}
            </button>
          </form>

          <div style={card}>
            <h3 style={{ marginBottom: 14, fontSize: 14 }}>Saved for this client</h3>
            {loadingInterventions ? (
              <p style={{ color: "#888", fontSize: 13 }}>Loading…</p>
            ) : interventions.length === 0 ? (
              <p style={{ color: "#888", fontSize: 13 }}>No interventions yet.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {interventions.map((iv) => {
                  const sess = sessions.find((s) => s.id === iv.precedes_session);
                  return (
                    <li
                      key={iv.id}
                      style={{
                        borderBottom: "1px solid #eee",
                        padding: "10px 0",
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: 13 }}>{iv.label}</strong>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          Before: {sess ? formatSessionOptionLabel(sess) : "session removed"}
                        </div>
                        {iv.description?.trim() && (
                          <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{iv.description.trim()}</div>
                        )}
                      </div>
                      <button type="button" style={btnDanger} onClick={() => void handleDelete(iv.id)}>
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p style={{ fontSize: 12, color: "#888", marginTop: 12 }}>
              Open <strong>Graphs</strong> with <strong>All sessions</strong> selected to see the dashed lines.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
