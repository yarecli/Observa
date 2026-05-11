import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { API_BASE, authFetch } from "../api/authFetch";
import {
  valueForGraphMeasure,
  yAxisLabelForMeasure,
  type GraphEntry as GraphEntryMetric,
  type GraphYMeasure,
} from "../utils/graphMetrics";

type Role = "bcba" | "rbt" | "dsp";
interface User { id: number; username: string; role: Role; }

function isMockMode(): boolean {
  return new URLSearchParams(window.location.search).get("mock") === "true";
}

interface EntryApi {
  id: string;
  behavior: string;
  time_interval: string | null;
  frequency_count: number;
  duration_seconds: number | null;
  duration_minutes: number | null;
  occurrence: boolean | null;
  custom_values?: Record<string, unknown>;
}
interface ClientProfile {
  id: string;
  first_name: string;
  last_name: string;
}
interface BehaviorApi {
  id: string;
  client_id: string;
  name: string;
  operational_definition: string;
  tracking_type: "FREQ" | "DUR" | "PIR" | "WIR";
}
interface SessionApi {
  id: string;
  client_id: string;
  data_collector_id: string;
  date: string;
  session_identifier: string;
  session_number: number | null;
  /** Template used for this session (all templates contribute to the same client charts). */
  template?: string | null;
  entries: EntryApi[];
}
interface InterventionApi {
  id: string;
  client_id: string;
  precedes_session: string;
  label: string;
  description: string;
  created_at: string;
}

function getMockPayloads(clientId: string | undefined) {
  const mockClientId = clientId ?? "1";
  const client: ClientProfile = {
    id: mockClientId,
    first_name: "Demo",
    last_name: "Client",
  };

  const behaviorPayload: BehaviorApi[] = [
    {
      id: "b1",
      client_id: mockClientId,
      name: "Target Behavior",
      operational_definition: "A mock definition for the target behavior.",
      tracking_type: "FREQ",
    },
    {
      id: "b2",
      client_id: mockClientId,
      name: "Duration Behavior",
      operational_definition: "A mock definition for duration tracking.",
      tracking_type: "DUR",
    },
  ];

  const sessionPayload: SessionApi[] = [
    {
      id: "session-1",
      client_id: mockClientId,
      data_collector_id: "Alice",
      date: "2026-04-01T09:00:00Z",
      session_identifier: "Morning",
      session_number: 1,
      entries: [
        {
          id: "entry-1",
          behavior: "b1",
          time_interval: null,
          frequency_count: 4,
          duration_seconds: null,
          duration_minutes: null,
          occurrence: true,
          custom_values: {},
        },
        {
          id: "entry-2",
          behavior: "b2",
          time_interval: null,
          frequency_count: 0,
          duration_seconds: null,
          duration_minutes: 8,
          occurrence: false,
          custom_values: {},
        },
      ],
    },
    {
      id: "session-2",
      client_id: mockClientId,
      data_collector_id: "Bob",
      date: "2026-04-05T10:30:00Z",
      session_identifier: "Afternoon",
      session_number: 2,
      entries: [
        {
          id: "entry-3",
          behavior: "b1",
          time_interval: null,
          frequency_count: 2,
          duration_seconds: null,
          duration_minutes: null,
          occurrence: false,
          custom_values: {},
        },
        {
          id: "entry-4",
          behavior: "b2",
          time_interval: null,
          frequency_count: 0,
          duration_seconds: null,
          duration_minutes: 12,
          occurrence: true,
          custom_values: {},
        },
      ],
    },
    {
      id: "session-3",
      client_id: mockClientId,
      data_collector_id: "Charlie",
      date: "2026-04-10T14:15:00Z",
      session_identifier: "Evening",
      session_number: 3,
      entries: [
        {
          id: "entry-5",
          behavior: "b1",
          time_interval: null,
          frequency_count: 6,
          duration_seconds: null,
          duration_minutes: null,
          occurrence: true,
          custom_values: {},
        },
        {
          id: "entry-6",
          behavior: "b2",
          time_interval: null,
          frequency_count: 0,
          duration_seconds: null,
          duration_minutes: 10,
          occurrence: true,
          custom_values: {},
        },
      ],
    },
  ];

  const interventionPayload: InterventionApi[] = [
    {
      id: "iv-mock-1",
      client_id: mockClientId,
      precedes_session: "session-2",
      label: "Intervention",
      description: "Example phase change before session 2 (mock data).",
      created_at: "",
    },
  ];

  return { client, behaviorPayload, sessionPayload, interventionPayload };
}
interface DataPoint {
  session: string;
  date: string;
  value: number;
  /** 0-based index along sorted client sessions (all-sessions trend); used for numeric session x-axis. */
  sessionIndex?: number;
}
interface PhaseChange {
  id?: string;
  session: string;
  label: string;
  description: string;
  /** Session x-axis: place line between sessions (e.g. 0.5 = between S1 and S2). */
  phaseXSession?: number;
  /** Date x-axis: midpoint between previous session and preceded session (matches `formatDateLabel`). */
  phaseDateLabel?: string;
}
interface BehaviorRecord {
  id: string;
  label: string;
  yAxisLabel: string;
  definition: string;
  color: string;
  data: DataPoint[];
  phaseChanges: PhaseChange[];
  /** When multiple API behavior rows share the same name (e.g. new sheet per template), graph merges them — these are the source ids. */
  sourceBehaviorIds?: string[];
}

function getCurrentUser(): User {
  const role = (localStorage.getItem("role") ?? "dsp") as Role;
  const username = localStorage.getItem("username") ?? "user";
  const id = Number(localStorage.getItem("userId") ?? "1");
  return { id, username, role };
}

const CHART_COLORS = ["#4a7c6f", "#c07a2a", "#5a68d8", "#ad4f9e", "#2f8ca8", "#b35c3a"];

/** Same display name + tracking type → one chart series (avoids duplicate "Screaming" lines from separate data sheets). */
function normalizeBehaviorNameForMerge(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function mergeKeyForBehavior(b: BehaviorApi): string {
  return `${normalizeBehaviorNameForMerge(b.name)}|${b.tracking_type}`;
}

function formatDateLabel(rawDate: string): string {
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) return rawDate;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/** Keeps the session-index X-axis from drawing one label per session when there are many (All view). */
function sessionAxisTickIndices(sessionCount: number, maxTicks = 14): number[] {
  if (sessionCount <= 0) return [];
  if (sessionCount <= maxTicks) return Array.from({ length: sessionCount }, (_, i) => i);
  const step = Math.ceil(sessionCount / maxTicks);
  const ticks: number[] = [];
  for (let i = 0; i < sessionCount; i += step) ticks.push(i);
  if (ticks[ticks.length - 1] !== sessionCount - 1) ticks.push(sessionCount - 1);
  return ticks;
}

/** Thins ordered category/date X values so angled labels do not overlap (All + Date on X). */
function thinOrderedXValues<T>(values: T[], maxTicks: number): T[] {
  if (values.length <= maxTicks) return values;
  const step = Math.ceil(values.length / maxTicks);
  const out: T[] = [];
  for (let i = 0; i < values.length; i += step) out.push(values[i]!);
  if (out[out.length - 1] !== values[values.length - 1]) out.push(values[values.length - 1]!);
  return out;
}

/** Dropdown / scope line: session name (or "Session N") and date only — avoids S1 + "Session 1" redundancy. */
function formatSessionOptionLabel(s: SessionApi): string {
  const d = new Date(s.date);
  const dateStr = Number.isNaN(d.getTime())
    ? formatDateLabel(s.date)
    : `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  const name = s.session_identifier?.trim();
  if (name) return `${name} — ${dateStr}`;
  if (s.session_number != null) return `Session ${s.session_number} — ${dateStr}`;
  return dateStr;
}

function entryXLabel(entry: EntryApi, index: number): string {
  const t = entry.time_interval?.trim();
  if (t) return t;
  return `E${index + 1}`;
}

function toGraphEntry(entry: EntryApi): GraphEntryMetric {
  return {
    behavior: entry.behavior,
    frequency_count: entry.frequency_count ?? 0,
    duration_seconds: entry.duration_seconds ?? null,
    duration_minutes: entry.duration_minutes ?? null,
    occurrence: entry.occurrence ?? null,
    custom_values: entry.custom_values ?? {},
  };
}

/** Maps saved interventions to chart phase lines (vertical line between the prior session and `precedes_session`). */
function phaseChangesFromInterventions(
  clientSessionsSorted: SessionApi[],
  interventions: InterventionApi[],
): PhaseChange[] {
  const byId = new Map(clientSessionsSorted.map((s, i) => [s.id, i]));
  const out: PhaseChange[] = [];
  for (const iv of interventions) {
    const idx = byId.get(iv.precedes_session);
    if (idx === undefined) continue;
    const sess = clientSessionsSorted[idx]!;
    const ordinal = sess.session_number ?? idx + 1;
    const prev = idx > 0 ? clientSessionsSorted[idx - 1]! : null;
    let phaseDateLabel: string | undefined;
    if (prev) {
      const t0 = new Date(prev.date).getTime();
      const t1 = new Date(sess.date).getTime();
      if (!Number.isNaN(t0) && !Number.isNaN(t1)) {
        phaseDateLabel = formatDateLabel(new Date((t0 + t1) / 2).toISOString());
      }
    }
    out.push({
      id: iv.id,
      session: `S${ordinal}`,
      label: iv.label.trim() || "Intervention",
      description: (iv.description ?? "").trim(),
      phaseXSession: idx > 0 ? idx - 0.5 : -0.5,
      phaseDateLabel,
    });
  }
  return out;
}

function buildBehaviorRecords(
  selectedClientId: string,
  behaviorPayload: BehaviorApi[],
  sessionPayload: SessionApi[],
  yMeasure: GraphYMeasure,
  graphSessionFilter: "all" | string,
  clientPhaseChanges: PhaseChange[],
): BehaviorRecord[] {
  const clientBehaviors = behaviorPayload.filter((b) => b.client_id === selectedClientId);
  const clientSessions = sessionPayload
    .filter((s) => s.client_id === selectedClientId)
    .sort((a, b) => {
      const aNum = a.session_number ?? Number.MAX_SAFE_INTEGER;
      const bNum = b.session_number ?? Number.MAX_SAFE_INTEGER;
      if (aNum !== bNum) return aNum - bNum;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

  const behaviorById = new Map(clientBehaviors.map((b) => [b.id, b]));
  const behaviorIndexById = new Map<string, number>();
  clientBehaviors.forEach((b, i) => behaviorIndexById.set(b.id, i));

  const mergeBuckets = new Map<string, BehaviorApi[]>();
  for (const b of clientBehaviors) {
    const mk = mergeKeyForBehavior(b);
    if (!mergeBuckets.has(mk)) mergeBuckets.set(mk, []);
    mergeBuckets.get(mk)!.push(b);
  }
  const mergedGroups = [...mergeBuckets.entries()].map(([mergeKey, group]) => ({
    mergeKey,
    group: [...group].sort((a, b) => a.id.localeCompare(b.id)),
  }));

  const singleSession =
    graphSessionFilter !== "all"
      ? clientSessions.find((s) => s.id === graphSessionFilter)
      : undefined;

  return mergedGroups.map(({ mergeKey, group }, idx) => {
    const canonical = group[0]!;
    const sourceIds = group.map((g) => g.id);
    const recordId = group.length === 1 ? canonical.id : `__merged__${mergeKey.replace(/\|/g, "_")}`;

    let points: DataPoint[];

    if (graphSessionFilter !== "all") {
      if (!singleSession) {
        points = [];
      } else {
        const matchingEntries = singleSession.entries.filter((e) => sourceIds.includes(e.behavior));
        points = matchingEntries.map((entry, i) => {
          const bdef = behaviorById.get(entry.behavior);
          if (!bdef) {
            return {
              session: entryXLabel(entry, i),
              date: formatDateLabel(singleSession.date),
              value: 0,
            };
          }
          const bIx = behaviorIndexById.get(entry.behavior) ?? 0;
          const v = valueForGraphMeasure(
            { id: bdef.id, tracking_type: bdef.tracking_type },
            bIx,
            toGraphEntry(entry),
            yMeasure,
          );
          return {
            session: entryXLabel(entry, i),
            date: formatDateLabel(singleSession.date),
            value: Number(v.toFixed(2)),
          };
        });
      }
    } else {
      points = clientSessions.map((session, sIdx) => {
        let total = 0;
        for (const bid of sourceIds) {
          const bdef = behaviorById.get(bid);
          if (!bdef) continue;
          const bIx = behaviorIndexById.get(bid) ?? 0;
          const matchingEntries = session.entries.filter((entry) => entry.behavior === bid);
          for (const entry of matchingEntries) {
            total += valueForGraphMeasure(
              { id: bdef.id, tracking_type: bdef.tracking_type },
              bIx,
              toGraphEntry(entry),
              yMeasure,
            );
          }
        }
        const ordinal = session.session_number ?? sIdx + 1;
        return {
          session: `S${ordinal}`,
          date: formatDateLabel(session.date),
          value: Number(total.toFixed(2)),
          sessionIndex: sIdx,
        };
      });
    }

    const yAxisLabel = yAxisLabelForMeasure(yMeasure, canonical.tracking_type);

    const definition =
      group.length === 1
        ? canonical.operational_definition
        : group
            .map((g) => g.operational_definition.trim())
            .filter(Boolean)
            .join(" · ");

    return {
      id: recordId,
      label: canonical.name.trim() || "Behavior",
      yAxisLabel,
      definition: definition || canonical.operational_definition,
      color: CHART_COLORS[idx % CHART_COLORS.length],
      data: points,
      phaseChanges: clientPhaseChanges,
      sourceBehaviorIds: group.length > 1 ? sourceIds : undefined,
    };
  });
}

const btn: React.CSSProperties = { padding: "5px 10px", border: "1px solid #ccc", background: "#f9f9f9", cursor: "pointer", fontSize: 12 };

/** Recharts Y-axis: `insideLeft` anchors at the top; `left` centers the label vertically along the axis. */
function rechartsYAxisLabel(text: string) {
  return {
    value: text,
    angle: -90 as const,
    position: "left" as const,
    offset: 0,
    fontSize: 11,
    fill: "#666",
    style: { textAnchor: "middle" as const },
  };
}

const CHART_MARGIN_SINGLE = { top: 16, right: 12, bottom: 24, left: 44 };
const CHART_MARGIN_COMBINED = { top: 16, right: 12, bottom: 56, left: 44 };

/** Custom legend so behavior names + swatches wrap cleanly. Rendered below the chart (not inside Recharts) so X-axis title stays above. */
function BehaviorSwatchLegendContent(props: {
  payload?: ReadonlyArray<{ value?: string; color?: string; dataKey?: unknown }>;
}) {
  const { payload } = props;
  if (!payload?.length) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignContent: "flex-start",
        gap: "8px 14px",
        paddingTop: 4,
        paddingBottom: 4,
        fontSize: 11,
        color: "#555",
        width: "100%",
        lineHeight: 1.3,
      }}
    >
      {payload.map((entry, i) => (
        <span
          key={`${String(entry.dataKey ?? "")}-${i}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span
            style={{
              width: 14,
              height: 3,
              flexShrink: 0,
              background: entry.color ?? "#ccc",
              borderRadius: 1,
            }}
          />
          <span>{entry.value}</span>
        </span>
      ))}
    </div>
  );
}

export default function ReviewVisualize(): JSX.Element {
  const user = getCurrentUser();
  const navigate = useNavigate();
  const { clientId: urlClientId } = useParams<{ clientId: string }>();
  const [clientName, setClientName] = useState(`Client ${urlClientId ?? ""}`.trim());
  const [behaviorPayload, setBehaviorPayload] = useState<BehaviorApi[]>([]);
  const [sessionPayload, setSessionPayload] = useState<SessionApi[]>([]);
  const [interventionPayload, setInterventionPayload] = useState<InterventionApi[]>([]);
  const [selectedBx, setSelectedBx] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [yMeasure, setYMeasure] = useState<GraphYMeasure>("primary");
  const [graphSessionFilter, setGraphSessionFilter] = useState<"all" | string>("all");

  // Client selection states
  const [allClients, setAllClients] = useState<ClientProfile[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(urlClientId ?? "");
  const chartExportRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    if (user.role === "dsp") {
      navigate("/dashboard", { replace: true });
    }
  }, [user.role, navigate]);

  // Fetch all clients for the dropdown
  useEffect(() => {
    async function loadClients() {
      try {
        const res = await authFetch(`${API_BASE}/clients/profiles/`);
        if (!res.ok) throw new Error("Failed to load clients");
        const clients = await res.json();
        setAllClients(clients);
        // If no client selected and we have clients, select the first one
        if (!selectedClientId && clients.length > 0) {
          setSelectedClientId(clients[0].id);
        }
      } catch (err) {
        console.error("Failed to load clients:", err);
      }
    }
    loadClients();
  }, [selectedClientId]);

  function handleClientChange(newClientId: string) {
    setSelectedClientId(newClientId);
    // Update URL
    navigate(`/review/${newClientId}`, { replace: true });
  }

  function handleLogout() { localStorage.clear(); navigate("/"); }
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [xAxisMode, setXAxisMode] = useState<"session" | "date">("session");

  const clientSessionsSorted = useMemo(() => {
    if (!selectedClientId) return [];
    return sessionPayload
      .filter((s) => s.client_id === selectedClientId)
      .sort((a, b) => {
        const aNum = a.session_number ?? Number.MAX_SAFE_INTEGER;
        const bNum = b.session_number ?? Number.MAX_SAFE_INTEGER;
        if (aNum !== bNum) return aNum - bNum;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
  }, [sessionPayload, selectedClientId]);

  const graphSessionFilterResolved = useMemo((): "all" | string => {
    if (graphSessionFilter === "all") return "all";
    if (clientSessionsSorted.some((s) => s.id === graphSessionFilter)) return graphSessionFilter;
    return "all";
  }, [graphSessionFilter, clientSessionsSorted]);

  const phaseChangesForGraph = useMemo(() => {
    if (graphSessionFilterResolved !== "all") return [];
    return phaseChangesFromInterventions(clientSessionsSorted, interventionPayload);
  }, [graphSessionFilterResolved, clientSessionsSorted, interventionPayload]);

  const behaviors = useMemo(
    () =>
      selectedClientId
        ? buildBehaviorRecords(
            selectedClientId,
            behaviorPayload,
            sessionPayload,
            yMeasure,
            graphSessionFilterResolved,
            phaseChangesForGraph,
          )
        : [],
    [selectedClientId, behaviorPayload, sessionPayload, yMeasure, graphSessionFilterResolved, phaseChangesForGraph],
  );

  useEffect(() => {
    setGraphSessionFilter("all");
  }, [selectedClientId]);

  useEffect(() => {
    if (graphSessionFilter !== "all" && graphSessionFilterResolved === "all") {
      setGraphSessionFilter("all");
    }
  }, [graphSessionFilter, graphSessionFilterResolved]);

  useEffect(() => {
    if (graphSessionFilterResolved !== "all") setXAxisMode("session");
  }, [graphSessionFilterResolved]);

  useEffect(() => {
    if (behaviors.length === 0) {
      setSelectedBx("");
      return;
    }
    setSelectedBx((prev) => {
      if (prev && behaviors.some((b) => b.id === prev)) return prev;
      if (prev) {
        const parent = behaviors.find((b) => b.sourceBehaviorIds?.includes(prev));
        if (parent) return parent.id;
      }
      return behaviors[0]!.id;
    });
  }, [behaviors]);

  useEffect(() => {
    if (!selectedClientId) {
      setLoadError("No client selected.");
      setLoading(false);
      return;
    }

    const mockMode = isMockMode();

    async function loadFromDatabase() {
      try {
        setLoading(true);
        setLoadError("");

        if (mockMode) {
          const { client, behaviorPayload: bPayload, sessionPayload: sPayload, interventionPayload: iPayload } =
            getMockPayloads(selectedClientId);
          setClientName(`${client.first_name} ${client.last_name}`.trim());
          setBehaviorPayload(bPayload);
          setSessionPayload(sPayload);
          setInterventionPayload(iPayload);
          return;
        }

        const [clientRes, behaviorRes, sessionsRes, invRes] = await Promise.all([
          authFetch(`${API_BASE}/clients/profiles/${selectedClientId}/`),
          authFetch(`${API_BASE}/datasheet/behaviors/`),
          authFetch(`${API_BASE}/datasheet/sessions/`),
          authFetch(`${API_BASE}/datasheet/interventions/?client_id=${encodeURIComponent(selectedClientId)}`),
        ]);

        if (!clientRes.ok) throw new Error("Failed to load client profile.");
        if (!behaviorRes.ok) throw new Error("Failed to load behaviors.");
        if (!sessionsRes.ok) throw new Error("Failed to load sessions.");

        const client = (await clientRes.json()) as ClientProfile;
        const bPayload = (await behaviorRes.json()) as BehaviorApi[];
        const sPayload = (await sessionsRes.json()) as SessionApi[];
        const invJson = invRes.ok ? ((await invRes.json()) as unknown) : [];
        setInterventionPayload(Array.isArray(invJson) ? (invJson as InterventionApi[]) : []);

        setClientName(`${client.first_name} ${client.last_name}`.trim());
        setBehaviorPayload(bPayload);
        setSessionPayload(sPayload);
      } catch (err) {
        if (mockMode) {
          const { client, behaviorPayload: bPayload, sessionPayload: sPayload, interventionPayload: iPayload } =
            getMockPayloads(selectedClientId);
          setClientName(`${client.first_name} ${client.last_name}`.trim());
          setBehaviorPayload(bPayload);
          setSessionPayload(sPayload);
          setInterventionPayload(iPayload);
          return;
        }

        const message = err instanceof Error ? err.message : "Failed to load graph data.";
        setLoadError(message);
      } finally {
        setLoading(false);
      }
    }

    void loadFromDatabase();
  }, [selectedClientId]);

  const graphView = useMemo(() => {
    if (behaviors.length === 0) return null;
    const activeBx = behaviors.find(b => b.id === selectedBx) ?? behaviors[0]!;
    const isAll = selectedBx === "__all__";

    const singleSessionView = graphSessionFilterResolved !== "all";
    const xAxisModeEffective: "session" | "date" = singleSessionView ? "session" : xAxisMode;
    const xAxisLabelBottom =
      singleSessionView ? "Entry / interval" : xAxisModeEffective === "session" ? "Session" : "Date";
    const selectedSessionForGraph = clientSessionsSorted.find((s) => s.id === graphSessionFilterResolved);
    const sessionScopeLabel =
      graphSessionFilterResolved === "all"
        ? "All sessions"
        : selectedSessionForGraph
          ? formatSessionOptionLabel(selectedSessionForGraph)
          : "Session";

    /** All-sessions + session x-axis: use numeric indices so phase lines sit between ticks (e.g. 0.5 between S1 and S2). */
    const useNumericSessionX = graphSessionFilterResolved === "all" && xAxisModeEffective === "session";
    const sessionCountForAxis = isAll ? (behaviors[0]?.data.length ?? 0) : activeBx.data.length;
    const numericSessionAxisProps =
      useNumericSessionX && sessionCountForAxis > 0
        ? {
            type: "number" as const,
            domain: [-0.5, sessionCountForAxis - 1 + 0.5] as [number, number],
            ticks: sessionAxisTickIndices(sessionCountForAxis),
            tickFormatter: (v: number) =>
              (isAll ? behaviors[0]?.data[v]?.session : activeBx.data[v]?.session) ?? String(v),
            allowDecimals: false,
          }
        : {};

    const chartData = activeBx.data.map((d) => ({
      ...d,
      x:
        useNumericSessionX && d.sessionIndex !== undefined
          ? d.sessionIndex
          : xAxisModeEffective === "session"
            ? d.session
            : d.date,
    }));

    const combinedYLabel =
      yMeasure === "primary" && isAll
        ? "Value (per behavior)"
        : yAxisLabelForMeasure(yMeasure, "FREQ");

    const combinedData = (() => {
      if (!isAll) return [];
      if (!singleSessionView) {
        return activeBx.data.map((p, i) => {
          const row: Record<string, number | string> = {
            x:
              xAxisMode === "session"
                ? (p.sessionIndex !== undefined ? p.sessionIndex : i)
                : p.date,
          };
          for (const b of behaviors) {
            row[b.label] = b.data[i]?.value ?? 0;
          }
          return row;
        });
      }
      const maxLen = Math.max(0, ...behaviors.map((b) => b.data.length));
      return Array.from({ length: maxLen }, (_, i) => {
        const row: Record<string, number | string> = {
          x: behaviors[0]?.data[i]?.session ?? `E${i + 1}`,
        };
        for (const b of behaviors) {
          row[b.label] = b.data[i]?.value ?? 0;
        }
        return row;
      });
    })();

    /** Combined "All" + Date on X: only show a subset of tick labels when there are many sessions. */
    const combinedXCategoricalTicks =
      !useNumericSessionX && isAll && combinedData.length > 14
        ? thinOrderedXValues(
            combinedData.map((row) => row.x as string | number),
            14,
          )
        : undefined;

    /** Bottom margin only for X-axis ticks + title (behavior swatches render in HTML below the chart). */
    let combinedChartBottomMargin = CHART_MARGIN_COMBINED.bottom;
    if (!useNumericSessionX && isAll && combinedData.length > 14) {
      combinedChartBottomMargin = Math.max(combinedChartBottomMargin, 72);
    }
    if (isAll && singleSessionView) {
      combinedChartBottomMargin = Math.max(
        combinedChartBottomMargin,
        36 + Math.min(110, 28 + combinedData.length * 5),
      );
    }
    if (isAll && !singleSessionView && useNumericSessionX && sessionCountForAxis > 14) {
      combinedChartBottomMargin = Math.max(combinedChartBottomMargin, 72);
    }

    /** Push the plot area down slightly when All + one session (more air above the grid). */
    const combinedChartTopMargin =
      isAll && singleSessionView ? CHART_MARGIN_COMBINED.top + 20 : CHART_MARGIN_COMBINED.top;

    const chartHeightPx = (() => {
      if (!isAll) {
        return activeBx.data.length > 14 ? 260 : 220;
      }
      if (singleSessionView && combinedData.length > 8) {
        return behaviors.length > 5 ? 380 : 340;
      }
      return behaviors.length > 5 ? 340 : 300;
    })();

    function renderPhaseLines(phaseChanges: PhaseChange[]) {
      return phaseChanges.map((pc) => (
        <ReferenceLine
          key={pc.id ?? `${pc.session}-${pc.label}`}
          x={
            xAxisModeEffective === "session"
              ? useNumericSessionX
                ? (pc.phaseXSession ?? 0)
                : pc.session
              : pc.phaseDateLabel ??
                activeBx.data.find((d) => d.session === pc.session)?.date ??
                pc.session
          }
          stroke="#333"
          strokeDasharray="4 3"
          strokeWidth={1.5}
          label={{ value: pc.label, position: "top", fontSize: 10, fill: "#333" }}
        />
      ));
    }

    const combinedChartMargin = {
      ...CHART_MARGIN_COMBINED,
      top: combinedChartTopMargin,
      bottom: combinedChartBottomMargin,
    };

    return {
      activeBx,
      isAll,
      singleSessionView,
      xAxisModeEffective,
      xAxisLabelBottom,
      sessionScopeLabel,
      useNumericSessionX,
      sessionCountForAxis,
      numericSessionAxisProps,
      chartData,
      combinedYLabel,
      combinedData,
      combinedXCategoricalTicks,
      combinedChartMargin,
      chartHeightPx,
      renderPhaseLines,
    };
  }, [behaviors, selectedBx, graphSessionFilterResolved, xAxisMode, yMeasure, clientSessionsSorted]);

  const exportGraphPdf = useCallback(async () => {
    if (!graphView) return;
    const el = chartExportRef.current;
    if (!el) return;
    const { singleSessionView, isAll, combinedYLabel, activeBx, sessionScopeLabel } = graphView;
    const safe = (s: string) => s.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 48) || "export";
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");

    setExportingPdf(true);
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 12;
      let y = margin;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text(`${clientName} — Review & Visualize`, margin, y);
      y += 7;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      const xDesc = singleSessionView ? "Entry / interval" : xAxisMode === "session" ? "Sessions" : "Date";
      const subtitle = isAll
        ? `All behaviors — ${chartType} — ${sessionScopeLabel} — Y: ${combinedYLabel} — X: ${xDesc}`
        : `${activeBx.label} (${activeBx.yAxisLabel}) — ${chartType} — ${sessionScopeLabel} — X: ${xDesc}`;
      const splitSubtitle = pdf.splitTextToSize(subtitle, pageW - 2 * margin);
      pdf.text(splitSubtitle, margin, y);
      y += splitSubtitle.length * 4 + 4;

      const props = pdf.getImageProperties(imgData);
      const maxW = pageW - 2 * margin;
      const maxH = pageH - y - margin;
      let drawW = maxW;
      let drawH = (props.height * drawW) / props.width;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = (props.width * drawH) / props.height;
      }
      pdf.addImage(imgData, "PNG", margin, y, drawW, drawH);

      const fname = isAll
        ? `graphs_all_${safe(clientName)}_${stamp}.pdf`
        : `graphs_${safe(clientName)}_${safe(activeBx.label)}_${stamp}.pdf`;
      pdf.save(fname);
    } catch (e) {
      console.error(e);
      window.alert("Could not create PDF. Try again or use a different browser.");
    } finally {
      setExportingPdf(false);
    }
  }, [graphView, clientName, chartType, xAxisMode]);

  const singleSessionView = graphSessionFilterResolved !== "all";
  const isAllSelected = selectedBx === "__all__";

  if (user.role === "dsp") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif" }}>
        <p style={{ color: "#666" }}>Redirecting…</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif" }}>
        <p style={{ color: "#666" }}>Loading graph data…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif" }}>
        <p style={{ color: "#b0471c" }}>{loadError}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "Arial, sans-serif", fontSize: 14 }}>
      {/* sidebar */}
      <aside style={{ width: 180, background: "#5b8278", color: "white", padding: 16, display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #4a5e56" }}>Observa</div>
        {(() => {
          const items: { label: string; path: string | null }[] = [
            { label: "Dashboard", path: "/dashboard" },
            { label: "Data Entry", path: "/data-entry" },
            { label: "Intervention", path: "/intervention" },
            { label: "Graphs", path: "/review" },
            { label: "Client Datasheets", path: "/client-datasheets" },
          ];
          if (user.role === "bcba") items.push({ label: "Employees", path: null });
          function navActive(label: string): boolean {
            if (label === "Graphs") return true;
            return false;
          }
          return items.map((item) => (
            <button key={item.label}
              style={{
                background: navActive(item.label) ? "rgba(255,255,255,0.15)" : "none",
                border: "none",
                color: navActive(item.label) ? "white" : "rgba(255,255,255,0.6)",
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
          ));
        })()}
      </aside>

      {/* main */}
      <main style={{ flex: 1, background: "#f5f5f5", padding: 24, minWidth: 0 }}>
        <div style={{ marginBottom: 12, fontSize: 13, color: "#666" }}>
          <span style={{ cursor: "pointer", color: "#4a7c6f" }} onClick={() => navigate("/dashboard")}>Dashboard</span>
          {" › "}
          <span style={{ cursor: "pointer", color: "#4a7c6f" }} onClick={() => navigate("/dashboard")}>Clients</span>
          {" › "}
          <strong style={{ color: "#333" }}>{clientName}</strong>
        </div>

        {/* Client Selector */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ fontSize: 14, fontWeight: "bold", color: "#333" }}>Select Client:</label>
          <select
            value={selectedClientId}
            onChange={(e) => handleClientChange(e.target.value)}
            style={{
              padding: "8px 12px",
              border: "1px solid #ccc",
              borderRadius: 4,
              fontSize: 14,
              minWidth: 200,
              background: "white"
            }}
          >
            {allClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.first_name} {client.last_name}
              </option>
            ))}
          </select>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 20 }}>{clientName} — Review & Visualize</h1>

        {/* ── GRAPHS (datasheet table lives on Client Datasheets) ── */}
        <div style={{ maxWidth: 960 }}>
          <div style={{ background: "white", border: "1px solid #ccc" }}>
            {/* header row */}
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #ccc", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <strong style={{ fontSize: 13 }}>📈 Graphs</strong>
              <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                <button style={{ ...btn, background: chartType === "line" ? "#4a7c6f" : "#f9f9f9", color: chartType === "line" ? "white" : "#333" }} onClick={() => setChartType("line")}>Line</button>
                <button style={{ ...btn, background: chartType === "bar"  ? "#4a7c6f" : "#f9f9f9", color: chartType === "bar"  ? "white" : "#333" }} onClick={() => setChartType("bar")}>Bar</button>
                <button
                  type="button"
                  disabled={exportingPdf || !graphView}
                  title={!graphView ? "Add behavior data to export a chart." : undefined}
                  style={{
                    ...btn,
                    borderColor: "#4a7c6f",
                    color: "#4a7c6f",
                    fontWeight: 600,
                    background: "#fff",
                    opacity: exportingPdf || !graphView ? 0.6 : 1,
                  }}
                  onClick={() => void exportGraphPdf()}
                >
                  {exportingPdf ? "Exporting…" : "Export PDF"}
                </button>
              </div>
            </div>

            {/* behavior tabs */}
            <div style={{ padding: "10px 14px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
              {behaviors.map(bx => (
                <button key={bx.id}
                  style={{ ...btn, background: selectedBx === bx.id ? bx.color : "#f9f9f9", color: selectedBx === bx.id ? "white" : "#333", borderColor: bx.color }}
                  onClick={() => setSelectedBx(bx.id)}>
                  {bx.label}
                </button>
              ))}
              <button
                style={{ ...btn, background: isAllSelected ? "#555" : "#f9f9f9", color: isAllSelected ? "white" : "#333" }}
                onClick={() => setSelectedBx("__all__")}>
                All
              </button>
            </div>

            {/* session scope + Y measure */}
            <div style={{ padding: "8px 14px 0", display: "flex", alignItems: "center", gap: 10, fontSize: 12, flexWrap: "wrap" }}>
              <label style={{ color: "#666", display: "flex", alignItems: "center", gap: 6 }}>
                Session
                <select
                  value={graphSessionFilterResolved === "all" ? "all" : graphSessionFilterResolved}
                  onChange={(e) => setGraphSessionFilter(e.target.value === "all" ? "all" : e.target.value)}
                  style={{ padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 12, maxWidth: 280, background: "#fff" }}
                >
                  <option value="all">All sessions (trend)</option>
                  {clientSessionsSorted.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatSessionOptionLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ color: "#666", display: "flex", alignItems: "center", gap: 6 }}>
                Y-axis
                <select
                  value={yMeasure}
                  onChange={(e) => setYMeasure(e.target.value as GraphYMeasure)}
                  style={{ padding: "4px 8px", border: "1px solid #ccc", borderRadius: 4, fontSize: 12, background: "#fff" }}
                >
                  <option value="primary">Default (per tracking type)</option>
                  <option value="frequency">Frequency (count)</option>
                  <option value="duration">Duration (minutes)</option>
                  <option value="occurrence">Occurrence (0 / 1)</option>
                </select>
              </label>
            </div>

            {/* x-axis toggle */}
            <div style={{ padding: "8px 14px 0", display: "flex", alignItems: "center", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
              <span style={{ color: "#666" }}>X-axis:</span>
              <button
                type="button"
                style={{ ...btn, padding: "3px 8px", fontSize: 11, background: xAxisMode === "session" ? "#333" : "#f9f9f9", color: xAxisMode === "session" ? "white" : "#333" }}
                onClick={() => setXAxisMode("session")}
              >
                {singleSessionView ? "Entry order" : "Sessions"}
              </button>
              <button
                type="button"
                disabled={singleSessionView}
                title={singleSessionView ? "Date applies when viewing all sessions." : undefined}
                style={{
                  ...btn,
                  padding: "3px 8px",
                  fontSize: 11,
                  background: xAxisMode === "date" ? "#333" : "#f9f9f9",
                  color: xAxisMode === "date" ? "white" : "#333",
                  opacity: singleSessionView ? 0.45 : 1,
                  cursor: singleSessionView ? "not-allowed" : "pointer",
                }}
                onClick={() => setXAxisMode("date")}
              >
                Date
              </button>
              {singleSessionView && (
                <span style={{ color: "#888", fontSize: 11 }}>One session: X shows each entry or interval in that session.</span>
              )}
            </div>

            {/* definition */}
            {graphView && !graphView.isAll && (
              <div style={{ margin: "10px 14px 0", padding: "8px 10px", background: "#f9f9f9", border: "1px solid #e0e0e0", fontSize: 12, color: "#555" }}>
                <strong>Definition:</strong> {graphView.activeBx.definition}
              </div>
            )}

            {/* Phase change lines: hover the dashed lines on the chart to see descriptions */}

            {/* chart (ref target for PDF export) */}
            {graphView ? (
            <div ref={chartExportRef} style={{ padding: "12px 14px 16px", background: "#fff" }}>
              <p style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                {graphView.isAll
                  ? `All behaviors — ${graphView.combinedYLabel} — ${graphView.sessionScopeLabel}`
                  : `${graphView.activeBx.label} — ${graphView.activeBx.yAxisLabel} — ${graphView.sessionScopeLabel}`}
              </p>

              {!graphView.isAll && graphView.activeBx.data.length === 0 ? (
                <div style={{ padding: "32px 12px", textAlign: "center", color: "#888", fontSize: 13 }}>
                  No data points for this behavior in the selected session. Choose &quot;All sessions&quot; or another session.
                </div>
              ) : (
                graphView.isAll ? (
                  <>
                    <ResponsiveContainer width="100%" height={graphView.chartHeightPx}>
                      {chartType === "line" ? (
                        <LineChart data={graphView.combinedData} margin={graphView.combinedChartMargin}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis
                            dataKey="x"
                            {...(graphView.useNumericSessionX
                              ? {
                                  ...graphView.numericSessionAxisProps,
                                  tick: { fontSize: graphView.sessionCountForAxis > 14 ? 9 : 10 },
                                }
                              : {
                                  ...(graphView.combinedXCategoricalTicks
                                    ? { ticks: graphView.combinedXCategoricalTicks }
                                    : {}),
                                  angle: -45,
                                  textAnchor: "end",
                                  height:
                                    graphView.singleSessionView && !graphView.useNumericSessionX
                                      ? Math.min(100, 40 + graphView.combinedData.length * 2.5)
                                      : graphView.combinedXCategoricalTicks
                                        ? 82
                                        : 68,
                                  minTickGap:
                                    graphView.combinedXCategoricalTicks !== undefined
                                      ? 2
                                      : graphView.combinedData.length > 14
                                        ? 18
                                        : 6,
                                  tick: {
                                    fontSize:
                                      graphView.combinedXCategoricalTicks !== undefined
                                        ? 9
                                        : graphView.combinedData.length > 14
                                          ? 8
                                          : 9,
                                  },
                                })}
                            label={
                              graphView.singleSessionView
                                ? {
                                    value: graphView.xAxisLabelBottom,
                                    position: "bottom",
                                    offset: 10,
                                    fontSize: 11,
                                    fill: "#666",
                                  }
                                : {
                                    value: graphView.xAxisLabelBottom,
                                    position: "insideBottom",
                                    offset: graphView.useNumericSessionX ? -12 : -36,
                                    fontSize: 11,
                                    fill: "#666",
                                  }
                            }
                          />
                          <YAxis tick={{ fontSize: 10 }} label={rechartsYAxisLabel(graphView.combinedYLabel)} />
                          <Tooltip />
                          {graphView.renderPhaseLines(graphView.activeBx.phaseChanges)}
                          {behaviors.map((behavior) => (
                            <Line
                              key={behavior.id}
                              type="linear"
                              dataKey={behavior.label}
                              stroke={behavior.color}
                              strokeWidth={2}
                              dot={{ r: 3 }}
                            />
                          ))}
                        </LineChart>
                      ) : (
                        <BarChart data={graphView.combinedData} margin={graphView.combinedChartMargin}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis
                            dataKey="x"
                            {...(graphView.useNumericSessionX
                              ? {
                                  ...graphView.numericSessionAxisProps,
                                  tick: { fontSize: graphView.sessionCountForAxis > 14 ? 9 : 10 },
                                }
                              : {
                                  ...(graphView.combinedXCategoricalTicks
                                    ? { ticks: graphView.combinedXCategoricalTicks }
                                    : {}),
                                  angle: -45,
                                  textAnchor: "end",
                                  height:
                                    graphView.singleSessionView && !graphView.useNumericSessionX
                                      ? Math.min(100, 40 + graphView.combinedData.length * 2.5)
                                      : graphView.combinedXCategoricalTicks
                                        ? 82
                                        : 68,
                                  minTickGap:
                                    graphView.combinedXCategoricalTicks !== undefined
                                      ? 2
                                      : graphView.combinedData.length > 14
                                        ? 18
                                        : 6,
                                  tick: {
                                    fontSize:
                                      graphView.combinedXCategoricalTicks !== undefined
                                        ? 9
                                        : graphView.combinedData.length > 14
                                          ? 8
                                          : 9,
                                  },
                                })}
                            label={
                              graphView.singleSessionView
                                ? {
                                    value: graphView.xAxisLabelBottom,
                                    position: "bottom",
                                    offset: 10,
                                    fontSize: 11,
                                    fill: "#666",
                                  }
                                : {
                                    value: graphView.xAxisLabelBottom,
                                    position: "insideBottom",
                                    offset: graphView.useNumericSessionX ? -12 : -36,
                                    fontSize: 11,
                                    fill: "#666",
                                  }
                            }
                          />
                          <YAxis tick={{ fontSize: 10 }} label={rechartsYAxisLabel(graphView.combinedYLabel)} />
                          <Tooltip />
                          {graphView.renderPhaseLines(graphView.activeBx.phaseChanges)}
                          {behaviors.map((behavior) => (
                            <Bar key={behavior.id} dataKey={behavior.label} fill={behavior.color} />
                          ))}
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                    <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid #eaeaea" }}>
                      <BehaviorSwatchLegendContent
                        payload={behaviors.map((b) => ({
                          value: b.label,
                          color: b.color,
                          dataKey: b.id,
                        }))}
                      />
                    </div>
                  </>
                ) : (
                  <ResponsiveContainer width="100%" height={graphView.chartHeightPx}>
                    {chartType === "line" ? (
                      <LineChart data={graphView.chartData} margin={CHART_MARGIN_SINGLE}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis
                          dataKey="x"
                          tick={{ fontSize: 10 }}
                          {...graphView.numericSessionAxisProps}
                          label={{ value: graphView.xAxisLabelBottom, position: "insideBottom", offset: -12, fontSize: 11, fill: "#666" }}
                        />
                        <YAxis tick={{ fontSize: 10 }} label={rechartsYAxisLabel(graphView.activeBx.yAxisLabel)} />
                        <Tooltip />
                        {graphView.renderPhaseLines(graphView.activeBx.phaseChanges)}
                        <Line type="linear" dataKey="value" name={graphView.activeBx.yAxisLabel} stroke={graphView.activeBx.color} strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    ) : (
                      <BarChart data={graphView.chartData} margin={CHART_MARGIN_SINGLE}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis
                          dataKey="x"
                          tick={{ fontSize: 10 }}
                          {...graphView.numericSessionAxisProps}
                          label={{ value: graphView.xAxisLabelBottom, position: "insideBottom", offset: -12, fontSize: 11, fill: "#666" }}
                        />
                        <YAxis tick={{ fontSize: 10 }} label={rechartsYAxisLabel(graphView.activeBx.yAxisLabel)} />
                        <Tooltip />
                        {graphView.renderPhaseLines(graphView.activeBx.phaseChanges)}
                        <Bar dataKey="value" name={graphView.activeBx.yAxisLabel} fill={graphView.activeBx.color} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                )
              )}

              {/* trend summary */}
              {!graphView.isAll && graphView.activeBx.data.length > 0 && (() => {
                const d = graphView.activeBx.data;
                const avg = (d.reduce((s, p) => s + p.value, 0) / d.length).toFixed(1);
                const first = d[0]!.value;
                const pct =
                  first === 0
                    ? d[d.length - 1]!.value === 0
                      ? 0
                      : 100
                    : Math.round(((d[d.length - 1]!.value - first) / first) * 100);
                return (
                  <div style={{ display: "flex", gap: 16, marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee", fontSize: 12 }}>
                    <span>Avg: <strong>{avg}</strong></span>
                    <span>Peak: <strong>{Math.max(...d.map(p => p.value))}</strong></span>
                    <span>Latest: <strong>{d[d.length-1].value}</strong></span>
                    <span>Trend: <strong style={{ color: pct < 0 ? "green" : "red" }}>{pct < 0 ? "▼" : "▲"} {Math.abs(pct)}%</strong></span>
                  </div>
                );
              })()}
            </div>
            ) : (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#666", fontSize: 14, borderTop: "1px solid #eee" }}>
                <p>No behavior data found for this client yet.</p>
                <p style={{ fontSize: 12, color: "#888", marginTop: 10, maxWidth: 440, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5 }}>
                  Use <strong>Data Entry</strong> to add behaviors and sessions for this client, or select a different client above.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

