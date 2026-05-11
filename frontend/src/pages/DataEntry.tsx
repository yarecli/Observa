import type { JSX } from "react";
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { CSSProperties } from "react";
import { authFetch, API_BASE, syncUserIdFromServer } from "../api/authFetch";
import type {
  BackendTemplateColumn,
  BackendTemplateDetails,
  BackendTemplateRow,
} from "../datasheet/sheetTemplateMode";
import {
  getDriGridKeys,
  getLayoutType,
  getSheetMode,
  isDurationFrequencySessionTemplate,
  isDurationTrialColumnKey,
  paperTrialColumnRoles,
  sessionRowLabel,
  templateColumnsForDriBehaviors,
} from "../datasheet/sheetTemplateMode";

type Role = "bcba" | "rbt" | "dsp";
interface User { id: number; username: string; role: Role; }
interface Client { id: string; name: string; assignedTo: number[]; }
/** `key` = stable series id for graphs/exports (legacy interval & duration); defaults like custom_key, custom_key_2 */
interface Behavior { id: number; label: string; definition: string; key?: string; }
interface FormErrors {
  client?: string;
  template?: string;
  sessionNumber?: string;
  timePeriod?: string;
  minuteValue?: string;
  behaviors?: string;
  behaviorOccurred?: string;
  /** Default template: per-behavior Session Details (occurrence + measurement). */
  legacyOtherPerBehavior?: Record<number, { occurred?: string; measurement?: string }>;
}
interface BackendTemplate { id: string; name: string; }
interface BackendBehavior { id: string; name: string; operational_definition: string; }

function getCurrentUser(): User {
  const role = (localStorage.getItem("role") ?? "dsp") as Role;
  const username = localStorage.getItem("username") ?? "user";
  const id = Number(localStorage.getItem("userId") ?? "1");
  return { id, username, role };
}

const MOCK_CLIENTS: Client[] = [
  { id: "00000000-0000-0000-0000-000000000001", name: "Alex Johnson", assignedTo: [1, 2] },
  { id: "00000000-0000-0000-0000-000000000002", name: "Maria Garcia", assignedTo: [1, 3] },
  { id: "00000000-0000-0000-0000-000000000003", name: "Devon Williams", assignedTo: [2, 3] },
  { id: "00000000-0000-0000-0000-000000000004", name: "Sam Patel", assignedTo: [1] },
];

const FALLBACK_TEMPLATES = [
  { id: "duration", label: "Duration Frequency Session" },
  { id: "sib", label: "Behavior Frequency Sheet" },
  { id: "trial", label: "Session/Response/Duration" },
];

/**
 * Short slugs in ?template= → resolved via GET /templates/ (UUID ids).
 */
const DASHBOARD_TEMPLATE_SLUG_TO_NAME: Record<string, string> = {
  duration: "Duration Frequency Session",
  /** Legacy slug: map to Behavior Frequency Sheet for old links */
  custom: "Behavior Frequency Sheet",
  sib: "Behavior Frequency Sheet",
  trial: "Session/Response/Duration",
};

/** Only treat list rows as API-backed when id looks like a UUID (Dashboard slugs are "dri", etc.). */
function resolveDashboardTemplateSlug(
  slug: string,
  fromList: { id: string; label: string }[]
): string | undefined {
  const name = DASHBOARD_TEMPLATE_SLUG_TO_NAME[slug];
  if (!name) return undefined;
  const row = fromList.find((t) => t.label === name);
  if (!row?.id?.includes("-")) return undefined;
  return row.id;
}

interface BackendClient {
  id: string;  // UUID from backend
  first_name: string;
  last_name: string;
}
/** Backend caseload response from /api/clients/caseloads/ */
interface BackendCaseload {
  client: string;  // UUID string matching Client.id
  staff: number;
}

const TIME_PERIODS = ["Morning (8am–12pm)", "Afternoon (12pm–4pm)", "Evening (4pm–8pm)", "Full Day", "Custom"];

/** Select value for custom time — user must fill `customTimeDetail`. */
const TIME_PERIOD_CUSTOM = "Custom";

function resolvedPassageTime(timePeriod: string, customDetail: string): string {
  if (timePeriod === TIME_PERIOD_CUSTOM) return customDetail.trim();
  return timePeriod;
}

/** Default graph/export keys for behavior series: custom_key, custom_key_2, custom_key_3, … */
function defaultBehaviorGraphKey(zeroBasedIndex: number): string {
  if (zeroBasedIndex <= 0) return "custom_key";
  return `custom_key_${zeroBasedIndex + 1}`;
}

function sessionDateToIsoDateTime(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  const y = parts[0];
  const mo = parts[1];
  const da = parts[2];
  if (!y || !mo || !da) return new Date().toISOString();
  return new Date(y, mo - 1, da, 12, 0, 0, 0).toISOString();
}

function behaviorGraphKey(b: Behavior, index: number): string {
  const raw = b.key?.trim();
  if (raw) return raw;
  return defaultBehaviorGraphKey(index);
}

const MEASUREMENTS = [
  "Frequency (count)",
  "Duration (minutes)",
  "Latency (seconds)",
  "Trials to Criterion",
  "Rate (per hour)",
  "Percentage of Intervals",
];

/** Per-behavior occurrence + measurement for legacy Default template (layout "other"). */
type LegacyOtherBehaviorSession = { occurred: string; measurement: string; value: string };

// Fallback: use MOCK_CLIENTS if API fetch fails
const FALLBACK_CLIENTS = MOCK_CLIENTS;

const inp: CSSProperties  = { width: "100%", padding: "7px 10px", border: "1px solid #ccc", fontSize: 13, boxSizing: "border-box" };
/** Centered cell inputs for data-entry grids (not session form fields). */
const inpSheet: CSSProperties = { ...inp, textAlign: "center" };

/** Controlled `type="number"` value when state is stored as a string (paper / duration extras). */
function sheetStrToNumberInputValue(s: string | undefined): string | number {
  const t = s ?? "";
  if (t === "") return "";
  const n = Number(t);
  return Number.isFinite(n) ? n : "";
}

const DEFAULT_BINARY_CHOICE_LABELS: [string, string] = ["Yes", "No"];

/**
 * Two button labels from a column label like "Occurrence (Yes/No)" or "Occurrence (+/-)" — uses the last "(a/b)" pair.
 */
function binaryChoiceLabelsFromColumnLabel(label: string | undefined | null): [string, string] {
  const t = (label ?? "").trim();
  if (!t) return DEFAULT_BINARY_CHOICE_LABELS;
  const open = t.lastIndexOf("(");
  const close = t.lastIndexOf(")");
  if (open === -1 || close <= open) return DEFAULT_BINARY_CHOICE_LABELS;
  const inner = t.slice(open + 1, close).trim();
  const slash = inner.indexOf("/");
  if (slash === -1) return DEFAULT_BINARY_CHOICE_LABELS;
  const a = inner.slice(0, slash).trim();
  const b = inner.slice(slash + 1).trim();
  if (!a || !b) return DEFAULT_BINARY_CHOICE_LABELS;
  return [a, b];
}
const sel: CSSProperties  = { ...inp, background: "white" };
const lbl: CSSProperties  = { display: "block", fontSize: 12, fontWeight: "bold", marginBottom: 4, color: "#444" };
const card: CSSProperties = { background: "white", border: "1px solid #ccc", padding: 20, marginBottom: 16 };
const btn: CSSProperties  = { padding: "8px 18px", border: "1px solid #ccc", background: "#f9f9f9", cursor: "pointer", fontSize: 13 };
const btnPrimary: CSSProperties = { padding: "8px 18px", border: "none", background: "#4a7c6f", color: "white", cursor: "pointer", fontSize: 13 };
const logoutBtn: CSSProperties  = { background: "none", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", padding: "7px 10px", cursor: "pointer", textAlign: "left", width: "100%", fontSize: 13, borderRadius: 4, marginTop: 6 };

const behaviorsTabIntroStyle: CSSProperties = { fontSize: 12, color: "#666", marginBottom: 12, lineHeight: 1.45 };
const BEHAVIORS_TAB_INTRO =
  "Edit behavior name or add behaviors. Enter operational definitions here.";

function trackingTypeForTemplate(templateDetails: BackendTemplateDetails | null): "FREQ" | "DUR" | "PIR" | "WIR" {
  if (!templateDetails) return "FREQ";
  const hasDuration =
    templateDetails.columns.some((c) => c.key === "duration_seconds") ||
    templateDetails.columns.some((c) => c.key === "duration_minutes");
  return hasDuration ? "DUR" : "FREQ";
}

/** Per-behavior grid fields on duration templates (values keyed by behavior, not row extras). */
const DURATION_BEHAVIOR_GRID_KEYS = new Set(["frequency_count", "duration_minutes", "occurrence"]);

/** Row-level inputs on the duration grid: Minute + user-added columns only (not passage_of_time / behavior). */
function durationNonGridTemplateColumns(cols: BackendTemplateColumn[]): BackendTemplateColumn[] {
  return [...cols]
    .filter(
      (c) =>
        isDurationTrialColumnKey(c.key) || (c.key.startsWith("custom_") && !DURATION_BEHAVIOR_GRID_KEYS.has(c.key))
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Columns shown in Customize for Duration Frequency Session (measure labels + trial column + customs; hide behavior/passage_of_time). */
function durationCustomizeEditorColumns(cols: BackendTemplateColumn[]): BackendTemplateColumn[] {
  return [...cols]
    .filter(
      (c) =>
        isDurationTrialColumnKey(c.key) ||
        DURATION_BEHAVIOR_GRID_KEYS.has(c.key) ||
        (c.key.startsWith("custom_") && !DURATION_BEHAVIOR_GRID_KEYS.has(c.key))
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Fresh id for Customize editor rows (never reuse API ids — avoids duplicate/missing ids breaking React + updates). */
function newDraftColumnId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `draft-col-${crypto.randomUUID()}`;
  }
  return `draft-col-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Assign a new unique editor id to every column when opening Customize (data keys unchanged). */
function ensureUniqueColumnIdsForDraft(d: BackendTemplateDetails): BackendTemplateDetails {
  const next = cloneTemplateDetails(d);
  next.columns = [...next.columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  next.columns = next.columns.map((c, i) => ({
    ...c,
    id: newDraftColumnId(),
    order: c.order ?? i,
  }));
  return next;
}

function removeColumnAtIndex(d: BackendTemplateDetails, index: number): BackendTemplateDetails {
  if (index < 0 || index >= d.columns.length) return d;
  const nextCols = d.columns.filter((_, i) => i !== index);
  return {
    ...d,
    columns: nextCols.map((c, i) => ({ ...c, order: i })),
  };
}

function updateDraftColumnById(
  d: BackendTemplateDetails,
  colId: string,
  patch: Partial<BackendTemplateColumn>
): BackendTemplateDetails {
  const idx = d.columns.findIndex((x) => String(x.id) === String(colId));
  if (idx < 0) return d;
  return {
    ...d,
    columns: d.columns.map((x, j) => (j === idx ? { ...x, ...patch } : x)),
  };
}

function removeDraftColumnById(d: BackendTemplateDetails, colId: string): BackendTemplateDetails {
  const idx = d.columns.findIndex((x) => String(x.id) === String(colId));
  return idx >= 0 ? removeColumnAtIndex(d, idx) : d;
}

function cloneTemplateDetails(t: BackendTemplateDetails): BackendTemplateDetails {
  return JSON.parse(JSON.stringify(t)) as BackendTemplateDetails;
}

/** Default column titles for the system behavior-frequency layout (editable in Behaviors). */
const DEFAULT_SYSTEM_DRI_LABELS = ["Behavior Frequency", "Behavior 2 Frequency", "Behavior 3 Frequency"] as const;

function isServerTemplateColumnId(id: unknown): boolean {
  const s = String(id ?? "").trim();
  if (!s || s.startsWith("tmp-") || s.startsWith("draft-col-")) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function normalizeDraftForApply(t: BackendTemplateDetails): BackendTemplateDetails {
  const out = cloneTemplateDetails(t);
  out.columns = out.columns.map((c, i) => ({
    ...c,
    id: isServerTemplateColumnId(c.id) ? String(c.id) : `tmp-col-${i}-${c.key || "col"}`,
    order: i,
  }));
  out.rows = out.rows.map((r, i) => ({
    ...r,
    id: r.id && !String(r.id).startsWith("tmp-") ? r.id : `tmp-row-${i}-${r.row_label}`,
    order: i,
  }));
  return out;
}

type IntervalRowInput = {
  frequency_count: number | null;
  duration_seconds: number | null;
  behavior_occurrence_note: boolean | null;
};

type DurationRowInput = {
  frequency_count: number | null;
  duration_minutes: number | null;
  occurrence: boolean | null;
};

type PaperRowValues = Record<string, string>;

type SessionPayload = {
  client_id: string;
  data_collector_id: number;
  date: string;
  session_identifier: string;
  session_number: number;
  passage_of_time: string;
  template: string | null;
  selected_behaviors: string[];
  custom_columns: unknown[];
  custom_rows: unknown[];
  condition: string;
  stimulus: string;
  minute?: number | null;
  entries: Array<Record<string, unknown>>;
};

export default function DataEntry(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = getCurrentUser();
  
  // Load real clients from backend API
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!localStorage.getItem("access") && !localStorage.getItem("refresh")) {
        setClients(FALLBACK_CLIENTS);
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
          setClients(FALLBACK_CLIENTS);
          setLoadingClients(false);
          return;
        }
        
        const clientData = (await clientRes.json()) as unknown;
        const caseloadData = (await caseloadRes.json()) as unknown;
        
        if (!Array.isArray(clientData) || !Array.isArray(caseloadData) || cancelled) {
          setClients(FALLBACK_CLIENTS);
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
        
        const mapped = clientData.map((row: BackendClient) => ({
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          assignedTo: staffByClient[row.id] ?? [],
        }));
        setClients(mapped);
      } catch (err) {
        if (!cancelled) setClients(FALLBACK_CLIENTS);
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-fill from query params if navigated from Dashboard
  const [selectedClient, setSelectedClient] = useState(searchParams.get("clientId") ?? "");
  const [selectedTemplate, setSelectedTemplate] = useState(searchParams.get("template") ?? "");
  const [sessionNumber, setSessionNumber] = useState("");
  /** Empty = use “now” on save (optional) */
  const [sessionDate, setSessionDate] = useState("");
  const [timePeriod, setTimePeriod] = useState("");
  /** When Time Period is "Custom", this text is saved as passage_of_time / time_interval. */
  const [customTimeDetail, setCustomTimeDetail] = useState("");
  const [behaviorOccurred, setBehaviorOccurred] = useState("");
  /** Occurrence + measurement per behavior id for Default template session details. */
  const [legacyOtherByBehaviorId, setLegacyOtherByBehaviorId] = useState<Record<number, LegacyOtherBehaviorSession>>({});
  const [notes, setNotes] = useState("");
  /** Legacy templates: default one behavior; user can add more */
  const [behaviors, setBehaviors] = useState<Behavior[]>([
    { id: 1, label: "Bx 1", definition: "", key: "custom_key" },
  ]);
  /** Data Sheet (paper): same pattern as legacy, default one behavior */
  const [paperTrialBehaviors, setPaperTrialBehaviors] = useState<Behavior[]>([
    { id: 1, label: "Bx 1", definition: "" },
  ]);
  /** DRI / behavior-frequency: labels align with frequency columns (add/remove for custom templates). */
  const [driBehaviorDefs, setDriBehaviorDefs] = useState<
    Array<{ id: number; label: string; definition: string }>
  >(() =>
    DEFAULT_SYSTEM_DRI_LABELS.map((label, i) => ({
      id: i + 1,
      label,
      definition: "",
    }))
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [templates, setTemplates] = useState(FALLBACK_TEMPLATES);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [templateDetails, setTemplateDetails] = useState<BackendTemplateDetails | null>(null);
  /** Local edits to columns/rows without saving to the API yet */
  const [editedTemplate, setEditedTemplate] = useState<BackendTemplateDetails | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeDraft, setCustomizeDraft] = useState<BackendTemplateDetails | null>(null);
  const [saveAsName, setSaveAsName] = useState("");
  const [saveAsDescription, setSaveAsDescription] = useState("");
  const [templateSaveError, setTemplateSaveError] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const effectiveTemplate = editedTemplate ?? templateDetails;
  const layoutType = getLayoutType(effectiveTemplate);
  const sheetMode = getSheetMode(effectiveTemplate);
  /** Duration Frequency Session: minute is per grid row, not a separate session field. */
  const showSessionMinuteForDuration =
    sheetMode === "legacy" &&
    layoutType === "duration" &&
    effectiveTemplate != null &&
    !isDurationFrequencySessionTemplate(effectiveTemplate);
  /** Always use target-driven grid so Behaviors tab add/remove matches columns (incl. system Behavior Frequency Sheet). */
  const driUseDynamicGrid = sheetMode === "paper_dri";
  const driDefsEffective = driBehaviorDefs;
  const trackingType = trackingTypeForTemplate(effectiveTemplate);
  const behaviorIdsKey = behaviors.map((b) => b.id).join(",");
  /** DRI targets changed (add/remove) — grid keys must include `dri_session_freq_*` for custom templates */
  const driDefIdsKey = sheetMode === "paper_dri" ? driBehaviorDefs.map((d) => d.id).join(",") : "";

  /** Only BCBAs may edit sheet layout / save custom templates (RBT/DSP: data entry only). */
  const canCustomizeTemplate = user.role === "bcba";

  const [minuteValue, setMinuteValue] = useState("");
  const [intervalInputs, setIntervalInputs] = useState<Array<Record<number, IntervalRowInput>>>([]);
  const [durationInputs, setDurationInputs] = useState<Array<Record<number, DurationRowInput>>>([]);
  /** Row-level template fields on duration layout (minute, passage_of_time, custom columns — not per-behavior grid). */
  const [durationRowExtras, setDurationRowExtras] = useState<Array<Record<string, string>>>([]);
  const [paperRows, setPaperRows] = useState<Array<{ id: string; row_label: string }>>([]);
  const [paperValues, setPaperValues] = useState<Array<PaperRowValues>>([]);
  const prevSelectedTemplateRef = useRef<string>("");

  /** Any template selection change (including clear) dismisses Customize so the draft never shows the wrong sheet. */
  useEffect(() => {
    setCustomizeOpen(false);
    setCustomizeDraft(null);
    setSaveAsName("");
    setSaveAsDescription("");
    setTemplateSaveError("");
  }, [selectedTemplate]);

  useEffect(() => {
    if (sheetMode !== "legacy" || layoutType !== "other") return;
    setLegacyOtherByBehaviorId((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const b of behaviors) {
        if (next[b.id] === undefined) {
          next[b.id] = { occurred: "", measurement: "", value: "" };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [behaviors, sheetMode, layoutType]);

  useEffect(() => {
    async function loadTemplates() {
      if (!localStorage.getItem("access") && !localStorage.getItem("refresh")) return;
      try {
        const res = await authFetch(`${API_BASE}/datasheet/templates/`);
        if (!res.ok) return;
        const data = (await res.json()) as BackendTemplate[];
        if (!Array.isArray(data) || data.length === 0) return;
        setTemplates(data.map((t) => ({ id: t.id, label: t.name })));
      } catch {
        /* keep FALLBACK_TEMPLATES */
      }
    }
    loadTemplates();
  }, []);

  /**
   * If the user chose a seeded fallback row (`duration` / `sib`) before GET /templates/ finished,
   * remap to the real template UUID once the API list replaces fallbacks — otherwise the select value
   * would not match any option and template details would never load.
   */
  useEffect(() => {
    const fallback = FALLBACK_TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!fallback) return;
    const match = templates.find((t) => t.label === fallback.label);
    if (match && match.id !== selectedTemplate) {
      setSelectedTemplate(match.id);
    }
  }, [templates, selectedTemplate]);

  // Replace dashboard slug (?template=dri) with real UUID once GET /templates/ returns UUID ids.
  useEffect(() => {
    const slug = selectedTemplate.trim();
    if (!slug || !DASHBOARD_TEMPLATE_SLUG_TO_NAME[slug]) return;
    const uuid = resolveDashboardTemplateSlug(slug, templates);
    if (uuid && uuid !== slug) setSelectedTemplate(uuid);
  }, [templates, selectedTemplate]);

  useEffect(() => {
    if (!selectedTemplate) {
      setTemplateDetails(null);
      setEditedTemplate(null);
      prevSelectedTemplateRef.current = "";
      return;
    }
    const raw = selectedTemplate.trim();
    /**
     * Dashboard may pass short slugs (?template=duration). Resolve to a real UUID via the template
     * list before fetching. Do NOT return when `resolved !== raw` — that is always true for slugs
     * and previously skipped the fetch until a later render (broken first click / long delay).
     */
    let idToFetch = raw;
    if (DASHBOARD_TEMPLATE_SLUG_TO_NAME[raw]) {
      const resolved = resolveDashboardTemplateSlug(raw, templates);
      if (!resolved) return;
      idToFetch = resolved;
    }
    // Only clear session-only layout edits when the user picks a different template — not when the
    // template list refetches (same id), so Customize → Apply is not wiped.
    if (prevSelectedTemplateRef.current !== selectedTemplate) {
      setEditedTemplate(null);
      prevSelectedTemplateRef.current = selectedTemplate;
    }

    if (!localStorage.getItem("access") && !localStorage.getItem("refresh")) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await authFetch(`${API_BASE}/datasheet/templates/${idToFetch}/`);
        if (cancelled) return;
        if (!res.ok) {
          setTemplateDetails(null);
          return;
        }
        const data = (await res.json()) as BackendTemplateDetails;
        if (!cancelled) setTemplateDetails(data);
      } catch {
        if (!cancelled) setTemplateDetails(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTemplate, templates]);

  // paper_dri: reset Behaviors when the template changes — system defaults vs. column labels from saved custom sheets.
  useEffect(() => {
    if (!templateDetails?.id) return;
    if (getSheetMode(templateDetails) !== "paper_dri") return;
    if (templateDetails.is_system_template) {
      setDriBehaviorDefs(
        DEFAULT_SYSTEM_DRI_LABELS.map((label, i) => ({
          id: i + 1,
          label,
          definition: "",
        }))
      );
      return;
    }
    const freqCols = templateColumnsForDriBehaviors(templateDetails.columns ?? []);
    if (freqCols.length === 0) return;
    setDriBehaviorDefs(
      freqCols.map((c, i) => ({
        id: i + 1,
        label: c.label.trim() || `Behavior ${i + 1} Frequency`,
        definition: "",
      }))
    );
  }, [templateDetails?.id, templateDetails?.is_system_template]);

  // Initialize grid data whenever template layout or behaviors change.
  useEffect(() => {
    if (sheetMode !== "legacy" && effectiveTemplate) {
      const rowLabels = effectiveTemplate.rows?.length
        ? effectiveTemplate.rows
        : sheetMode === "paper_trial"
          ? Array.from({ length: 10 }).map((_, i) => ({ id: `tmp-${i}`, row_label: sessionRowLabel(i), order: i }))
          : Array.from({ length: 12 }).map((_, i) => ({ id: `tmp-${i}`, row_label: `Row ${i + 1}`, order: i }));

      const cols = effectiveTemplate.columns ?? [];
      const baseKeys = cols.map((c) => c.key);
      const extraFreqKeys =
        sheetMode === "paper_dri" && driUseDynamicGrid
          ? getDriGridKeys(cols, driBehaviorDefs, true).freqKeys.filter((fk) => !baseKeys.includes(fk))
          : [];
      const keys = [...baseKeys, ...extraFreqKeys];
      setPaperRows(rowLabels.map((r) => ({ id: r.id, row_label: r.row_label })));
      setPaperValues((prev) =>
        rowLabels.map((_, rowIdx) => {
          const oldRow = prev[rowIdx] ?? {};
          const row: PaperRowValues = {};
          keys.forEach((k) => {
            row[k] = oldRow[k] ?? "";
          });
          return row;
        })
      );
      return;
    }

    if (layoutType === "interval" && effectiveTemplate) {
      const rowLabels = effectiveTemplate.rows?.length
        ? effectiveTemplate.rows
        : Array.from({ length: 10 }).map((_, i) => ({ id: `tmp-${i}`, row_label: sessionRowLabel(i), order: i }));
      setIntervalInputs(
        rowLabels.map(() => {
          const row: Record<number, IntervalRowInput> = {};
          behaviors.forEach((b) => {
            row[b.id] = {
              frequency_count: null,
              duration_seconds: null,
              behavior_occurrence_note: null,
            };
          });
          return row;
        })
      );
    }
    if (layoutType === "duration" && effectiveTemplate) {
      const rowLabels = effectiveTemplate.rows?.length
        ? effectiveTemplate.rows
        : Array.from({ length: 8 }).map((_, i) => ({ id: `tmp-${i}`, row_label: sessionRowLabel(i), order: i }));
      const extraCols = durationNonGridTemplateColumns(effectiveTemplate.columns ?? []);
      setDurationInputs(
        rowLabels.map(() => {
          const row: Record<number, DurationRowInput> = {};
          behaviors.forEach((b) => {
            row[b.id] = { frequency_count: null, duration_minutes: null, occurrence: null };
          });
          return row;
        })
      );
      setDurationRowExtras((prev) =>
        rowLabels.map((_, i) => {
          const row: Record<string, string> = {};
          extraCols.forEach((c) => {
            const prior = prev[i]?.[c.key];
            row[c.key] = prior ?? (isDurationTrialColumnKey(c.key) ? sessionRowLabel(i) : "");
          });
          return row;
        })
      );
    } else if (sheetMode === "legacy" && layoutType !== "duration") {
      setDurationRowExtras([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutType, sheetMode, behaviorIdsKey, effectiveTemplate, editedTemplate, driDefIdsKey, driUseDynamicGrid]);

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!selectedClient)   e.client = "Required.";
    // Allow empty string for default template selection
    if (!sessionNumber)    e.sessionNumber = "Required.";
    const needsTimePeriod =
      sheetMode === "legacy" ||
      sheetMode === "paper_trial" ||
      sheetMode === "paper_dri";
    if (needsTimePeriod && !timePeriod) e.timePeriod = "Required.";
    if (needsTimePeriod && timePeriod === TIME_PERIOD_CUSTOM && !customTimeDetail.trim()) {
      e.timePeriod = "Enter a custom time (e.g., 9:12am - 10:45am).";
    }
    if (sheetMode === "legacy" && behaviors.length === 0) e.behaviors = "Add at least one behavior.";
    if (sheetMode === "paper_trial" && paperTrialBehaviors.length === 0) e.behaviors = "Add at least one behavior.";
    if (sheetMode === "paper_dri" && driDefsEffective.length === 0) e.behaviors = "Add at least one behavior.";
    if (sheetMode === "paper_trial" && !behaviorOccurred) e.behaviorOccurred = "Required.";
    if (showSessionMinuteForDuration && !minuteValue) e.minuteValue = "Minute value is required.";
    if (layoutType === "other" && sheetMode === "legacy") {
      const per: Record<number, { occurred?: string; measurement?: string }> = {};
      for (const b of behaviors) {
        const row = legacyOtherByBehaviorId[b.id];
        if (!row?.occurred) per[b.id] = { ...per[b.id], occurred: "Required." };
        if (!row?.measurement?.trim()) per[b.id] = { ...per[b.id], measurement: "Required." };
      }
      if (Object.keys(per).length > 0) e.legacyOtherPerBehavior = per;
    }
    return e;
  }

  async function handleSubmit() {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSubmitError("");
    setSubmitting(true);

    if (!localStorage.getItem("access") && !localStorage.getItem("refresh")) {
      setSubmitError("You are not logged in. Please sign in again.");
      setSubmitting(false);
      return;
    }

    try {
      await syncUserIdFromServer();
      const collectorId = getCurrentUser().id;
      if (!collectorId) {
        setSubmitError("Could not resolve your account. Please sign in again.");
        setSubmitting(false);
        return;
      }

      const clientUuid = selectedClient;  // selectedClient is already a UUID from backend

      const behaviorsForSheet: Behavior[] =
        sheetMode === "paper_trial"
          ? paperTrialBehaviors
          : sheetMode === "paper_dri"
            ? driDefsEffective.map((b, i) => ({
                id: b.id,
                label: b.label || `Target ${i + 1}`,
                definition: b.definition,
              }))
            : behaviors;

      const createdBehaviors = await Promise.all(
        behaviorsForSheet.map(async (bx, index) => {
          const behaviorPayload = {
            client_id: clientUuid,
            name: bx.label || `Behavior ${index + 1}`,
            operational_definition: bx.definition || "No operational definition provided.",
            tracking_type: trackingType,
            is_active: true,
          };

          const behaviorRes = await authFetch(`${API_BASE}/datasheet/behaviors/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(behaviorPayload),
          });

          if (!behaviorRes.ok) {
            const errData = await behaviorRes.json().catch(() => ({}));
            throw new Error(errData.detail || "Failed to save behavior definitions.");
          }

          return (await behaviorRes.json()) as BackendBehavior;
        })
      );

      const passageT = resolvedPassageTime(timePeriod, customTimeDetail);
      const sessionPayload: SessionPayload = {
        client_id: clientUuid,
        data_collector_id: collectorId,
        date: sessionDate.trim() ? sessionDateToIsoDateTime(sessionDate.trim()) : new Date().toISOString(),
        session_identifier: `Session ${sessionNumber}`,
        session_number: Number(sessionNumber),
        passage_of_time:
          sheetMode === "legacy" || sheetMode === "paper_trial"
            ? passageT
            : passageT || "Custom",
        template: selectedTemplate || null,
        selected_behaviors: createdBehaviors.map((b) => b.id),
        custom_columns: [] as unknown[],
        custom_rows: [],
        condition: "",
        stimulus: "",
        entries: [],
      };

      if (sheetMode !== "legacy" && effectiveTemplate) {
        const cols = effectiveTemplate.columns ?? [];

        if (sheetMode === "paper_trial") {
          const { trialKey, responseKey, durationKey } = paperTrialColumnRoles(cols);

          sessionPayload.custom_columns = [
            {
              behavior_occurred: behaviorOccurred,
              behaviors: paperTrialBehaviors.map((b) => ({ label: b.label, definition: b.definition })),
            },
          ];

          sessionPayload.entries = paperRows.flatMap((row, rowIdx) => {
            const v = paperValues[rowIdx] ?? {};
            const trialNumber = Number(v[trialKey] || row.row_label || rowIdx + 1);
            const durationRaw = durationKey != null ? v[durationKey] : "";
            const durationSeconds = durationRaw === "" ? null : Number(durationRaw);
            const tn = Number.isFinite(trialNumber) ? trialNumber : rowIdx + 1;
            return createdBehaviors.map((cb) => ({
              behavior: cb.id,
              time_interval: passageT,
              frequency_count: 0,
              duration_seconds: Number.isFinite(durationSeconds as number) ? durationSeconds : null,
              duration_minutes: null,
              occurrence: behaviorOccurred === "Yes",
              behavior_occurrence_note: behaviorOccurred === "Yes",
              trial_number: tn,
              day_number: null,
              session_day_number: null,
              row_label: sessionRowLabel(rowIdx),
              custom_values: {
                ...v,
                notes,
                behavior_occurred: behaviorOccurred,
                ...(responseKey != null ? { [responseKey]: v[responseKey] ?? "" } : {}),
              },
            }));
          });
        }

        if (sheetMode === "paper_dri") {
          const { timeKey, latencyKey, freqKeys } = getDriGridKeys(cols, driDefsEffective, true);

          sessionPayload.custom_columns = [
            {
              target_behavior_definitions: driDefsEffective.map((d) => ({
                label: d.label,
                definition: d.definition,
              })),
              dri_grid_mode: "dynamic",
            },
          ];

          sessionPayload.entries = paperRows.flatMap((row, rowIdx) => {
            const v = paperValues[rowIdx] ?? {};
            const timeLabel = v[timeKey] || row.row_label;
            const latencyVal = v[latencyKey] === "" ? null : Number(v[latencyKey]);

            return createdBehaviors.map((beh, idx) => {
              const fk = freqKeys[idx];
              if (!fk) {
                return {
                  behavior: beh.id,
                  time_interval: timeLabel,
                  frequency_count: 0,
                  duration_seconds: null,
                  duration_minutes: null,
                  occurrence: null,
                  behavior_occurrence_note: null,
                  trial_number: rowIdx + 1,
                  day_number: null,
                  session_day_number: null,
                  row_label: timeLabel,
                  custom_values: { notes },
                };
              }
              const raw = v[fk] ?? "";
              const freq = raw === "" ? 0 : Number(raw);
              return {
                behavior: beh.id,
                time_interval: timeLabel,
                frequency_count: Number.isFinite(freq) ? freq : 0,
                duration_seconds: null,
                duration_minutes: null,
                occurrence: null,
                behavior_occurrence_note: null,
                trial_number: rowIdx + 1,
                day_number: null,
                session_day_number: null,
                row_label: timeLabel,
                custom_values:
                  idx === 0
                    ? { notes, [latencyKey]: Number.isFinite(latencyVal as number) ? latencyVal : null }
                    : { notes },
              };
            });
          });
        }

        // Skip legacy layout handling
      } else {
      const hasInterval =
        layoutType === "interval" &&
        effectiveTemplate?.columns.some((c) => c.key === "trial_number" || c.key === "session_number");
      const hasDuration =
        layoutType === "duration" && effectiveTemplate?.columns.some((c) => isDurationTrialColumnKey(c.key));

      const templateColumns = effectiveTemplate?.columns ?? [];
      const showFrequency = templateColumns.some((c) => c.key === "frequency_count");
      const showDurSeconds = templateColumns.some((c) => c.key === "duration_seconds");
      const showDurMinutes = templateColumns.some((c) => c.key === "duration_minutes");
      const showBehaviorOcc = templateColumns.some((c) => c.key === "behavior_occurrence_note");
      const showOccurrence = templateColumns.some((c) => c.key === "occurrence");

      if (hasInterval || hasDuration) {
        sessionPayload.custom_columns = [
          {
            behavior_series_keys: behaviors.map((b, i) => ({
              graph_key: behaviorGraphKey(b, i),
              label: b.label,
            })),
          },
        ];
      }

      if (hasInterval) {
        const rowLabels = effectiveTemplate?.rows?.length
          ? effectiveTemplate.rows
          : Array.from({ length: 10 }).map((_, i) => ({ id: `tmp-${i}`, row_label: sessionRowLabel(i), order: i }));

        sessionPayload.entries = rowLabels.flatMap((_, rowIdx) =>
          createdBehaviors.map((createdBehavior, behaviorIdx) => {
            const behaviorLocalId = behaviors[behaviorIdx].id;
            const rowInput = intervalInputs[rowIdx]?.[behaviorLocalId];
            const gk = behaviorGraphKey(behaviors[behaviorIdx], behaviorIdx);
            return {
              behavior: createdBehavior.id,
              time_interval: passageT,
              frequency_count: showFrequency ? (rowInput?.frequency_count ?? 0) : 0,
              duration_seconds: showDurSeconds ? rowInput?.duration_seconds ?? null : null,
              duration_minutes: null,
              occurrence: null,
              behavior_occurrence_note: showBehaviorOcc ? (rowInput?.behavior_occurrence_note ?? null) : null,
              trial_number: rowIdx + 1,
              day_number: null,
              session_day_number: null,
              row_label: sessionRowLabel(rowIdx),
              custom_values: { notes, graph_key: gk, behavior_label: behaviors[behaviorIdx].label },
            };
          })
        );
      } else if (hasDuration) {
        sessionPayload.minute =
          effectiveTemplate && isDurationFrequencySessionTemplate(effectiveTemplate)
            ? null
            : minuteValue
              ? Number(minuteValue)
              : null;

        const rowLabels = effectiveTemplate?.rows?.length
          ? effectiveTemplate.rows
          : Array.from({ length: 8 }).map((_, i) => ({ id: `tmp-${i}`, row_label: sessionRowLabel(i), order: i }));

        sessionPayload.entries = rowLabels.flatMap((_, rowIdx) =>
          createdBehaviors.map((createdBehavior, behaviorIdx) => {
            const behaviorLocalId = behaviors[behaviorIdx].id;
            const rowInput = durationInputs[rowIdx]?.[behaviorLocalId];
            const gk = behaviorGraphKey(behaviors[behaviorIdx], behaviorIdx);
            return {
              behavior: createdBehavior.id,
              time_interval: passageT,
              frequency_count: showFrequency ? (rowInput?.frequency_count ?? 0) : 0,
              duration_seconds: null,
              duration_minutes: showDurMinutes ? rowInput?.duration_minutes ?? null : null,
              occurrence: showOccurrence ? (rowInput?.occurrence ?? null) : null,
              behavior_occurrence_note: null,
              trial_number: rowIdx + 1,
              day_number: null,
              session_day_number: null,
              row_label: sessionRowLabel(rowIdx),
              custom_values: {
                notes,
                graph_key: gk,
                behavior_label: behaviors[behaviorIdx].label,
                ...(durationRowExtras[rowIdx] ?? {}),
              },
            };
          })
        );
      } else {
        // Default / custom template: one entry per behavior with its own occurrence + measurement
        sessionPayload.entries = createdBehaviors.map((behavior, index) => {
          const localBx = behaviors[index];
          const row = legacyOtherByBehaviorId[localBx.id] ?? { occurred: "", measurement: "", value: "" };
          const numericValue = Number(row.value || "0");
          const meas = row.measurement;
          const occurred = row.occurred === "Yes";
          return {
            behavior: behavior.id,
            time_interval: passageT,
            frequency_count: meas.startsWith("Frequency") ? numericValue : 0,
            duration_seconds: meas.startsWith("Duration") ? Math.round(numericValue * 60) : null,
            duration_minutes: meas.startsWith("Duration") ? numericValue : null,
            occurrence: occurred,
            behavior_occurrence_note: occurred,
            trial_number: index + 1,
            day_number: null,
            session_day_number: null,
            row_label: sessionRowLabel(index),
            custom_values: { measurement: meas, notes, behavior_label: localBx.label },
          };
        });
      }
      }

      const sessionRes = await authFetch(`${API_BASE}/datasheet/sessions/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sessionPayload),
      });

      if (!sessionRes.ok) {
        const errData = await sessionRes.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to save session.");
      }

      setSubmitted(true);
    } catch (err) {
      setSubmitError((err as Error).message || "Failed to save data entry.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedClient(""); setSelectedTemplate(""); setSessionNumber("");
    setSessionDate("");
    setTimePeriod(""); setCustomTimeDetail(""); setBehaviorOccurred(""); setLegacyOtherByBehaviorId({}); setNotes("");
    setMinuteValue("");
    setTemplateDetails(null);
    setEditedTemplate(null);
    setCustomizeOpen(false);
    setCustomizeDraft(null);
    setSaveAsName("");
    setSaveAsDescription("");
    setTemplateSaveError("");
    setPaperTrialBehaviors([{ id: 1, label: "Bx 1", definition: "" }]);
    setDriBehaviorDefs(
      DEFAULT_SYSTEM_DRI_LABELS.map((label, i) => ({
        id: i + 1,
        label,
        definition: "",
      }))
    );
    setIntervalInputs([]);
    setDurationInputs([]);
    setDurationRowExtras([]);
    setBehaviors([{ id: 1, label: "Bx 1", definition: "", key: "custom_key" }]);
    setErrors({}); setSubmitted(false); setSubmitError("");
  }

  function openCustomizeEditor() {
    if (!effectiveTemplate) return;
    setCustomizeDraft(ensureUniqueColumnIdsForDraft(effectiveTemplate));
    setCustomizeOpen(true);
    setTemplateSaveError("");
  }

  function applyCustomizeDraft() {
    if (!customizeDraft) return;
    const applied = normalizeDraftForApply(customizeDraft);
    setEditedTemplate(applied);
    // paper_dri: keep Behaviors tab + grid keys aligned when columns are added/renamed in Customize
    if (getSheetMode(applied) === "paper_dri") {
      const freqCols = templateColumnsForDriBehaviors(applied.columns ?? []);
      if (freqCols.length > 0) {
        setDriBehaviorDefs((prev) =>
          freqCols.map((c, i) => ({
            id: i + 1,
            label: c.label.trim() || `Behavior ${i + 1} Frequency`,
            definition: prev[i]?.definition ?? "",
          }))
        );
      }
    }
    setCustomizeOpen(false);
  }

  async function saveCustomizeAsNewTemplate() {
    if (!customizeDraft) return;
    if (!localStorage.getItem("access") && !localStorage.getItem("refresh")) {
      setTemplateSaveError("You are not logged in.");
      return;
    }
    const name = saveAsName.trim();
    if (!name) {
      setTemplateSaveError("Enter a name for the saved template.");
      return;
    }
    setSavingTemplate(true);
    setTemplateSaveError("");
    try {
      const cols = customizeDraft.columns.map((c, i) => ({
        key: c.key.trim() || `col_${i}`,
        label: c.label.trim() || `Column ${i + 1}`,
        field_type: c.field_type || "text",
        order: i,
        required: !!c.required,
      }));
      const rows = customizeDraft.rows.map((r, i) => ({
        row_label: r.row_label.trim() || `Row ${i + 1}`,
        order: i,
      }));
      const payload = {
        name,
        description: saveAsDescription.trim(),
        is_system_template: false,
        is_active: true,
        created_by_id: null,
        columns: cols,
        rows,
      };
      const res = await authFetch(`${API_BASE}/datasheet/templates/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.non_field_errors?.[0] || "Could not save template.");
      }
      const created = (await res.json()) as BackendTemplateDetails;
      setTemplates((prev) => [...prev, { id: created.id, label: created.name }]);
      setSelectedTemplate(created.id);
      setTemplateDetails(created);
      setEditedTemplate(null);
      setCustomizeOpen(false);
      setSaveAsName("");
      setSaveAsDescription("");
      try {
        const listRes = await authFetch(`${API_BASE}/datasheet/templates/`);
        if (listRes.ok) {
          const listData = (await listRes.json()) as BackendTemplate[];
          if (Array.isArray(listData) && listData.length > 0) {
            setTemplates(listData.map((t) => ({ id: t.id, label: t.name })));
          }
        }
      } catch {
        /* keep appended row */
      }
    } catch (e) {
      setTemplateSaveError((e as Error).message);
    } finally {
      setSavingTemplate(false);
    }
  }

  const clientName = clients.find((c) => c.id === selectedClient)?.name;

  if (submitted) {
    return (
      <div style={{ fontFamily: "Arial, sans-serif", display: "flex", minHeight: "100vh" }}>
        <Sidebar user={user} navigate={navigate} active="data-entry" />
        <main style={{ flex: 1, padding: 32, background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <h2 style={{ marginBottom: 8 }}>Session Saved</h2>
            <p style={{ color: "#666", marginBottom: 20 }}>
              Data entry for <strong>{clientName}</strong> has been recorded.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button style={btn} onClick={handleReset}>New Entry</button>
              <button style={btnPrimary} onClick={() => navigate(`/review/${selectedClient}`)}>
                View in Graphs
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Arial, sans-serif", display: "flex", minHeight: "100vh" }}>
      <Sidebar user={user} navigate={navigate} active="data-entry" />
      <main style={{ flex: 1, padding: 24, background: "#f5f5f5" }}>
        {/* breadcrumb */}
        <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
          <span style={{ color: "#4a7c6f", cursor: "pointer" }} onClick={() => navigate("/dashboard")}>Dashboard</span>
          {" › "}
          <span>Data Entry</span>
          {clientName && <>{" › "}<strong style={{ color: "#333" }}>{clientName}</strong></>}
        </div>

        <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 4 }}>Data Entry</h1>
        <p style={{ color: "#666", fontSize: 13, marginBottom: 20 }}>Record a behavioral observation session</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* left col */}
          <div>
            <div style={card}>
              <h3 style={{ marginBottom: 14, fontSize: 14 }}>Session Info</h3>

              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Client * {loadingClients && <span style={{ fontSize: 12, color: "#999" }}>(Loading...)</span>}</label>
                <select style={sel} value={selectedClient} onChange={e => setSelectedClient(e.target.value)} disabled={loadingClients}>
                  <option value="">Select client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {errors.client && <p style={{ color: "red", fontSize: 12, marginTop: 2 }}>{errors.client}</p>}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Select Template*</label>
                <select style={sel} value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                  <option value="">Default...</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                {errors.template && <p style={{ color: "red", fontSize: 12, marginTop: 2 }}>{errors.template}</p>}
                {templateDetails?.description != null && String(templateDetails.description).trim() !== "" && (
                  <p style={{ fontSize: 12, color: "#555", marginTop: 8, lineHeight: 1.45 }}>
                    {templateDetails.description}
                  </p>
                )}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Collected By</label>
                <input style={inp} value={user.username} readOnly />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Session # *</label>
                <input style={inp} type="number" min={1} value={sessionNumber}
                  onChange={e => setSessionNumber(e.target.value)} placeholder="e.g. 12" />
                {errors.sessionNumber && <p style={{ color: "red", fontSize: 12, marginTop: 2 }}>{errors.sessionNumber}</p>}
              </div>

            </div>

            {(sheetMode === "legacy" ||
              sheetMode === "paper_trial" ||
              sheetMode === "paper_dri") && (
              <div style={card}>
                <h3 style={{ marginBottom: 14, fontSize: 14 }}>Session Details</h3>

                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Session date (optional)</label>
                  <input
                    style={sel}
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                  />
                  <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                    Leave blank to use the time of save. Set a date to anchor the session for reporting.
                  </p>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Time Period *</label>
                  <select
                    style={sel}
                    value={timePeriod}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTimePeriod(v);
                      if (v !== TIME_PERIOD_CUSTOM) setCustomTimeDetail("");
                    }}
                  >
                    <option value="">Select...</option>
                    {TIME_PERIODS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {timePeriod === TIME_PERIOD_CUSTOM && (
                    <div style={{ marginTop: 10 }}>
                      <label style={lbl}>Enter custom time*</label>
                      <input
                        style={inp}
                        value={customTimeDetail}
                        onChange={(e) => setCustomTimeDetail(e.target.value)}
                        placeholder="e.g., 9:12am - 10:45am"
                      />
                    </div>
                  )}
                  {errors.timePeriod && <p style={{ color: "red", fontSize: 12, marginTop: 2 }}>{errors.timePeriod}</p>}
                </div>

                {sheetMode === "paper_trial" && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Did behavior(s) occur this session? *</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {(["Yes", "No"] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          style={{
                            ...btn,
                            flex: 1,
                            background: behaviorOccurred === opt ? "#4a7c6f" : "#f9f9f9",
                            color: behaviorOccurred === opt ? "white" : "#333",
                            borderColor: behaviorOccurred === opt ? "#4a7c6f" : "#ccc",
                          }}
                          onClick={() => setBehaviorOccurred(opt)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    {errors.behaviorOccurred && <p style={{ color: "red", fontSize: 12, marginTop: 2 }}>{errors.behaviorOccurred}</p>}
                  </div>
                )}

                {showSessionMinuteForDuration && (
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Minute *</label>
                    <input style={inp} type="number" min={0} value={minuteValue}
                      onChange={e => setMinuteValue(e.target.value)} placeholder="e.g. 9" />
                    {errors.minuteValue && <p style={{ color: "red", fontSize: 12, marginTop: 2 }}>{errors.minuteValue}</p>}
                  </div>
                )}

                {sheetMode === "legacy" && layoutType === "other" && (
                  <div style={{ marginBottom: 4 }}>
                    <p style={{ fontSize: 12, color: "#666", marginBottom: 12, lineHeight: 1.45 }}>
                      Enter behavior occurrence and measurement.
                    </p>
                    {behaviors.map((bx, bi) => {
                      const row = legacyOtherByBehaviorId[bx.id] ?? { occurred: "", measurement: "", value: "" };
                      const perErr = errors.legacyOtherPerBehavior?.[bx.id];
                      const displayName = (bx.label || "").trim() || `Behavior ${bi + 1}`;
                      return (
                        <div
                          key={bx.id}
                          style={{
                            marginBottom: 14,
                            paddingBottom: 14,
                            borderBottom: bi < behaviors.length - 1 ? "1px solid #e8e8e8" : "none",
                          }}
                        >
                          <div style={{ marginBottom: 10 }}>
                            <label style={lbl}>{`Did ${displayName} occur? *`}</label>
                            <div style={{ display: "flex", gap: 6 }}>
                              {(["Yes", "No"] as const).map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  style={{
                                    ...btn,
                                    flex: 1,
                                    background: row.occurred === opt ? "#4a7c6f" : "#f9f9f9",
                                    color: row.occurred === opt ? "white" : "#333",
                                    borderColor: row.occurred === opt ? "#4a7c6f" : "#ccc",
                                  }}
                                  onClick={() =>
                                    setLegacyOtherByBehaviorId((prev) => ({
                                      ...prev,
                                      [bx.id]: { ...(prev[bx.id] ?? { occurred: "", measurement: "", value: "" }), occurred: opt },
                                    }))
                                  }
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                            {perErr?.occurred && (
                              <p style={{ color: "red", fontSize: 12, marginTop: 2 }}>{perErr.occurred}</p>
                            )}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                            <div>
                              <label style={lbl}>Measurement *</label>
                              <select
                                style={sel}
                                value={row.measurement}
                                onChange={(e) =>
                                  setLegacyOtherByBehaviorId((prev) => ({
                                    ...prev,
                                    [bx.id]: {
                                      ...(prev[bx.id] ?? { occurred: "", measurement: "", value: "" }),
                                      measurement: e.target.value,
                                    },
                                  }))
                                }
                              >
                                <option value="">Select...</option>
                                {MEASUREMENTS.map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </select>
                              {perErr?.measurement && (
                                <p style={{ color: "red", fontSize: 12, marginTop: 2 }}>{perErr.measurement}</p>
                              )}
                            </div>
                            <div>
                              <label style={lbl}>Value</label>
                              <input
                                style={inp}
                                type="number"
                                min={0}
                                value={row.value}
                                onChange={(e) =>
                                  setLegacyOtherByBehaviorId((prev) => ({
                                    ...prev,
                                    [bx.id]: {
                                      ...(prev[bx.id] ?? { occurred: "", measurement: "", value: "" }),
                                      value: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="0"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {canCustomizeTemplate && selectedTemplate && effectiveTemplate && (
              <div style={card}>
                <h3 style={{ marginBottom: 10, fontSize: 14 }}>Sheet layout</h3>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>
                  {sheetMode === "legacy" &&
                  (layoutType === "interval" || layoutType === "duration" || layoutType === "other")
                    ? "Edit behavior labels and keys (column groups), measurement columns, and block/trial rows. Operational definitions stay in the Behaviors tab."
                    : "Customize row/column labels here, or save a copy with its own title and description."}
                </p>
                <button type="button" style={{ ...btnPrimary, width: "100%" }} onClick={openCustomizeEditor}>
                  Customize sheet…
                </button>
              </div>
            )}
          </div>

          {/* right col */}
          <div>
            {sheetMode === "paper_trial" && (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14 }}>Behaviors</h3>
                  <button
                    type="button"
                    style={{ ...btn, fontSize: 12, padding: "4px 10px" }}
                    onClick={() =>
                      setPaperTrialBehaviors((prev) => [
                        ...prev,
                        { id: Date.now(), label: `Behavior ${prev.length + 1}`, definition: "" },
                      ])
                    }
                  >
                    + Add behavior
                  </button>
                </div>
                <p style={behaviorsTabIntroStyle}>{BEHAVIORS_TAB_INTRO}</p>
                {paperTrialBehaviors.map((bx) => (
                  <div key={bx.id} style={{ marginBottom: 10, padding: 10, border: "1px solid #e0e0e0", background: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <strong style={{ fontSize: 13 }}>{bx.label}</strong>
                      <button
                        type="button"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 13 }}
                        disabled={paperTrialBehaviors.length <= 1}
                        onClick={() => setPaperTrialBehaviors((prev) => prev.filter((b) => b.id !== bx.id))}
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      style={{ ...inp, marginBottom: 6 }}
                      value={bx.label}
                      onChange={(e) =>
                        setPaperTrialBehaviors((prev) =>
                          prev.map((b) => (b.id === bx.id ? { ...b, label: e.target.value } : b))
                        )
                      }
                      placeholder="Label"
                    />
                    <textarea
                      style={{ ...inp, resize: "vertical", minHeight: 48 }}
                      placeholder="Operational definition…"
                      value={bx.definition}
                      onChange={(e) =>
                        setPaperTrialBehaviors((prev) =>
                          prev.map((b) => (b.id === bx.id ? { ...b, definition: e.target.value } : b))
                        )
                      }
                    />
                  </div>
                ))}
                {errors.behaviors && <p style={{ color: "red", fontSize: 12, marginTop: 6 }}>{errors.behaviors}</p>}
              </div>
            )}

            {sheetMode === "paper_dri" && (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14 }}>Behaviors</h3>
                  <button
                    type="button"
                    style={{ ...btn, fontSize: 12, padding: "4px 10px" }}
                    onClick={() =>
                      setDriBehaviorDefs((prev) => [
                        ...prev,
                        { id: Date.now(), label: `Behavior ${prev.length + 1} Frequency`, definition: "" },
                      ])
                    }
                  >
                    + Add behavior
                  </button>
                </div>
                <p style={behaviorsTabIntroStyle}>{BEHAVIORS_TAB_INTRO}</p>
                {driBehaviorDefs.map((bx, i) => (
                  <div key={bx.id} style={{ marginBottom: 10, padding: 10, border: "1px solid #e0e0e0", background: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <strong style={{ fontSize: 13 }}>Bx {i + 1}</strong>
                      <button
                        type="button"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 13 }}
                        disabled={driBehaviorDefs.length <= 1}
                        onClick={() => setDriBehaviorDefs((prev) => prev.filter((b) => b.id !== bx.id))}
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      style={{ ...inp, marginBottom: 6 }}
                      value={bx.label}
                      onChange={(e) =>
                        setDriBehaviorDefs((prev) =>
                          prev.map((b) => (b.id === bx.id ? { ...b, label: e.target.value } : b))
                        )
                      }
                      placeholder={
                        i < DEFAULT_SYSTEM_DRI_LABELS.length
                          ? DEFAULT_SYSTEM_DRI_LABELS[i]
                          : `Behavior ${i + 1} Frequency`
                      }
                    />
                    <textarea
                      style={{ ...inp, resize: "vertical", minHeight: 48 }}
                      value={bx.definition}
                      onChange={(e) =>
                        setDriBehaviorDefs((prev) =>
                          prev.map((b) => (b.id === bx.id ? { ...b, definition: e.target.value } : b))
                        )
                      }
                      placeholder="Operational definition…"
                    />
                  </div>
                ))}
                {errors.behaviors && <p style={{ color: "red", fontSize: 12, marginTop: 6 }}>{errors.behaviors}</p>}
              </div>
            )}

            {sheetMode === "legacy" && (layoutType === "interval" || layoutType === "duration") && (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14 }}>Behaviors</h3>
                  <button
                    style={{ ...btn, fontSize: 12, padding: "4px 10px" }}
                    onClick={() =>
                      setBehaviors((prev) => [
                        ...prev,
                        {
                          id: Date.now(),
                          label: `Bx ${prev.length + 1}`,
                          definition: "",
                          key: defaultBehaviorGraphKey(prev.length),
                        },
                      ])
                    }
                  >
                    + Add Behavior
                  </button>
                </div>
                <p style={behaviorsTabIntroStyle}>{BEHAVIORS_TAB_INTRO}</p>
                {behaviors.map((bx) => (
                  <div key={bx.id} style={{ marginBottom: 10, padding: 10, border: "1px solid #e0e0e0", background: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <strong style={{ fontSize: 13 }}>{bx.label}</strong>
                      <button
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 13 }}
                        onClick={() => setBehaviors((prev) => prev.filter((b) => b.id !== bx.id))}
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      style={{ ...inp, marginBottom: 6 }}
                      value={bx.label}
                      onChange={(e) =>
                        setBehaviors((prev) => prev.map((b) => (b.id === bx.id ? { ...b, label: e.target.value } : b)))
                      }
                      placeholder="Label"
                    />
                    <textarea
                      style={{ ...inp, resize: "vertical", minHeight: 48 }}
                      placeholder="Operational definition…"
                      value={bx.definition}
                      onChange={(e) =>
                        setBehaviors((prev) => prev.map((b) => (b.id === bx.id ? { ...b, definition: e.target.value } : b)))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            {sheetMode === "legacy" && layoutType === "other" && (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14 }}>Behaviors</h3>
                  <button
                    style={{ ...btn, fontSize: 12, padding: "4px 10px" }}
                    onClick={() =>
                      setBehaviors((prev) => [
                        ...prev,
                        { id: Date.now(), label: `Bx ${prev.length + 1}`, definition: "", key: defaultBehaviorGraphKey(prev.length) },
                      ])
                    }
                  >
                    + Add behavior
                  </button>
                </div>
                <p style={behaviorsTabIntroStyle}>{BEHAVIORS_TAB_INTRO}</p>
                {behaviors.map((bx, i) => (
                  <div key={bx.id} style={{ marginBottom: 10, padding: 10, border: "1px solid #e0e0e0", background: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <strong style={{ fontSize: 13 }}>Bx {i + 1}</strong>
                      <button
                        type="button"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 13 }}
                        disabled={behaviors.length <= 1}
                        onClick={() => setBehaviors((prev) => prev.filter((b) => b.id !== bx.id))}
                      >
                        ✕
                      </button>
                    </div>
                    <input
                      style={{ ...inp, marginBottom: 8 }}
                      value={bx.label}
                      onChange={(e) =>
                        setBehaviors((prev) => prev.map((b) => (b.id === bx.id ? { ...b, label: e.target.value } : b)))
                      }
                      placeholder="Label"
                    />
                    <textarea
                      style={{ ...inp, resize: "vertical", minHeight: 48 }}
                      placeholder="Operational definition..."
                      value={bx.definition}
                      onChange={(e) =>
                        setBehaviors((prev) => prev.map((b) => (b.id === bx.id ? { ...b, definition: e.target.value } : b)))
                      }
                    />
                  </div>
                ))}
              </div>
            )}

            <div style={card}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Session Notes</h3>
              <textarea style={{ ...inp, resize: "vertical" }} rows={5}
                placeholder="Any observations or context..."
                value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {sheetMode === "legacy" && errors.behaviors && <p style={{ color: "red", fontSize: 12, marginTop: 10 }}>{errors.behaviors}</p>}

            {/* live summary */}
            {(selectedClient || sessionNumber || notes.trim()) && (
              <div style={{ ...card, background: "#f0f9f5", border: "1px solid #c0ddd5" }}>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Summary</h3>
                <div style={{ fontSize: 12, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
                  {clientName     && <><span style={{ color: "#666" }}>Client:</span>     <strong>{clientName}</strong></>}
                  {sessionDate.trim() && (
                    <>
                      <span style={{ color: "#666" }}>Session date:</span>
                      <strong>
                        {(() => {
                          const p = sessionDate.split("-").map(Number);
                          if (p.length !== 3 || !p[0]) return sessionDate;
                          return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, {
                            weekday: "short",
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          });
                        })()}
                      </strong>
                    </>
                  )}
                  {selectedTemplate && (
                    <>
                      <span style={{ color: "#666" }}>Template:</span>{" "}
                      <strong>{effectiveTemplate?.name ?? templates.find((t) => t.id === selectedTemplate)?.label}</strong>
                    </>
                  )}
                  {sessionNumber  && <><span style={{ color: "#666" }}>Session:</span>    <strong>#{sessionNumber}</strong></>}
                  {timePeriod && (timePeriod !== TIME_PERIOD_CUSTOM || customTimeDetail.trim()) && (
                    <>
                      <span style={{ color: "#666" }}>Time:</span>{" "}
                      <strong>{resolvedPassageTime(timePeriod, customTimeDetail) || timePeriod}</strong>
                    </>
                  )}
                  {sheetMode === "paper_trial" && behaviorOccurred && (
                    <>
                      <span style={{ color: "#666" }}>Occurred:</span> <strong>{behaviorOccurred}</strong>
                    </>
                  )}
                  {layoutType === "other" &&
                    sheetMode === "legacy" &&
                    behaviors.some((b) => {
                      const r = legacyOtherByBehaviorId[b.id];
                      return r?.occurred || r?.measurement;
                    }) && (
                      <>
                        <span style={{ color: "#666" }}>Per behavior:</span>
                        <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" as const }}>
                          {behaviors
                            .map((b, i) => {
                              const r = legacyOtherByBehaviorId[b.id];
                              if (!r?.occurred && !r?.measurement) return null;
                              const name = (b.label || "").trim() || `Behavior ${i + 1}`;
                              const meas = r.measurement ? `${r.measurement}${r.value ? ` — ${r.value}` : ""}` : "—";
                              return `${name}: ${r.occurred || "—"}; ${meas}`;
                            })
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </>
                    )}
                  {sheetMode === "paper_trial" && paperTrialBehaviors.length > 0 && (
                    <>
                      <span style={{ color: "#666" }}>Behaviors:</span>
                      <strong>{paperTrialBehaviors.map((b) => b.label).join(", ")}</strong>
                    </>
                  )}
                  {sheetMode === "paper_dri" && driDefsEffective.length > 0 && (
                    <>
                      <span style={{ color: "#666" }}>Behaviors:</span>
                      <strong>{driDefsEffective.map((b) => b.label).join(", ")}</strong>
                    </>
                  )}
                  {sheetMode === "legacy" && behaviors.length > 0 && (
                    <>
                      <span style={{ color: "#666" }}>Behaviors:</span>
                      <strong>{behaviors.map((b) => b.label).join(", ")}</strong>
                    </>
                  )}
                  {notes.trim() && (
                    <>
                      <span style={{ color: "#666" }}>Session notes:</span>
                      <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" as const }}>{notes}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {customizeOpen && customizeDraft && (
          <div style={{ ...card, marginTop: 16, border: "2px solid #4a7c6f" }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Customize sheet</h3>
            <p style={{ fontSize: 12, color: "#666", marginBottom: 12 }}>
              Edit column and row labels, or add/remove rows and columns. <strong>Apply to this session</strong> only changes this form until you save a new template.
            </p>
            {templateSaveError && <p style={{ color: "#8a2b21", fontSize: 12, marginBottom: 8 }}>{templateSaveError}</p>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                {sheetMode === "legacy" &&
                  (layoutType === "interval" || layoutType === "duration" || layoutType === "other") && (
                  <>
                    <strong style={{ fontSize: 13 }}>Behavior column groups</strong>
                    <p style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                      Same behaviors as the Behaviors tab — edit <strong>label</strong> and <strong>key</strong> here (keys auto-default to{" "}
                      <code>custom_key</code>, <code>custom_key_2</code>, …). Operational definitions are only in the Behaviors tab.
                    </p>
                    <div style={{ marginBottom: 12 }}>
                      {behaviors.map((bx) => (
                        <div key={bx.id} style={{ border: "1px solid #e0e0e0", padding: 8, background: "#fafafa", marginBottom: 8 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                            <div>
                              <label style={lbl}>Label</label>
                              <input
                                style={inp}
                                value={bx.label}
                                onChange={(e) =>
                                  setBehaviors((prev) =>
                                    prev.map((b) => (b.id === bx.id ? { ...b, label: e.target.value } : b))
                                  )
                                }
                              />
                            </div>
                            <div>
                              <label style={lbl}>Key</label>
                              <input
                                style={inp}
                                value={bx.key ?? ""}
                                onChange={(e) =>
                                  setBehaviors((prev) =>
                                    prev.map((b) => (b.id === bx.id ? { ...b, key: e.target.value } : b))
                                  )
                                }
                                placeholder={defaultBehaviorGraphKey(behaviors.findIndex((b) => b.id === bx.id))}
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            style={{ ...btn, marginTop: 6, fontSize: 12 }}
                            disabled={behaviors.length <= 1}
                            onClick={() => setBehaviors((prev) => prev.filter((b) => b.id !== bx.id))}
                          >
                            Remove behavior
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        style={{ ...btn, fontSize: 12 }}
                        onClick={() =>
                          setBehaviors((prev) => [
                            ...prev,
                            {
                              id: Date.now(),
                              label: `Bx ${prev.length + 1}`,
                              definition: "",
                              key: defaultBehaviorGraphKey(prev.length),
                            },
                          ])
                        }
                      >
                        + Add behavior
                      </button>
                    </div>
                    <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: 12, marginBottom: 12 }} />
                  </>
                )}
                {sheetMode === "legacy" && layoutType === "duration" && isDurationFrequencySessionTemplate(customizeDraft) && (
                  <p style={{ fontSize: 12, color: "#555", marginBottom: 10, lineHeight: 1.45 }}>
                    <strong>Duration Frequency Session:</strong> Edit <strong>Session</strong> (first column) and the three measure labels below
                    (Frequency, Duration, Occurrence). Each appears after the behavior name on the grid (e.g.{" "}
                    <em>Bx 1 Duration (Secs)</em> or <em>Screaming Duration (Mins)</em> when you rename the behavior or the measure
                    label). Use <strong>+ Add column</strong> for extra row fields (notes, etc.). <strong>Behaviors</strong> are only in
                    the section above.
                  </p>
                )}
                <strong style={{ fontSize: 13 }}>Measurement columns (template)</strong>
                <button
                  type="button"
                  style={{ ...btn, marginLeft: 8, fontSize: 12, padding: "4px 10px" }}
                  onClick={() =>
                    setCustomizeDraft((d) => {
                      if (!d) return d;
                      const nextOrder = d.columns.length;
                      return {
                        ...d,
                        columns: [
                          ...d.columns,
                          {
                            id: newDraftColumnId(),
                            key: `custom_${nextOrder}`,
                            label: "New column",
                            field_type: "text",
                            order: nextOrder,
                            required: false,
                          },
                        ],
                      };
                    })
                  }
                >
                  + Add column
                </button>
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {(sheetMode === "legacy" && layoutType === "duration" && isDurationFrequencySessionTemplate(customizeDraft)
                    ? durationCustomizeEditorColumns(customizeDraft.columns)
                    : customizeDraft.columns
                  ).map((c) => (
                    <div key={c.id} style={{ border: "1px solid #e0e0e0", padding: 8, background: "#fafafa" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <div>
                          <label style={lbl}>Label</label>
                          <input
                            style={inp}
                            autoComplete="off"
                            name={`customize-label-${c.id}`}
                            value={c.label}
                            onChange={(e) =>
                              setCustomizeDraft((d) => (d ? updateDraftColumnById(d, c.id, { label: e.target.value }) : d))
                            }
                          />
                        </div>
                        <div>
                          <label style={lbl}>Key</label>
                          <input
                            style={inp}
                            autoComplete="off"
                            name={`customize-key-${c.id}`}
                            value={c.key}
                            onChange={(e) =>
                              setCustomizeDraft((d) => (d ? updateDraftColumnById(d, c.id, { key: e.target.value }) : d))
                            }
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        style={{ ...btn, marginTop: 6, fontSize: 12 }}
                        onClick={() => setCustomizeDraft((d) => (d ? removeDraftColumnById(d, c.id) : d))}
                      >
                        Remove column
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <strong style={{ fontSize: 13 }}>Rows</strong>
                <button
                  type="button"
                  style={{ ...btn, marginLeft: 8, fontSize: 12, padding: "4px 10px" }}
                  onClick={() =>
                    setCustomizeDraft((d) => {
                      if (!d) return d;
                      const next = d.rows.length;
                      return {
                        ...d,
                        rows: [
                          ...d.rows,
                          { id: `tmp-row-${Date.now()}`, row_label: `Row ${next + 1}`, order: next },
                        ],
                      };
                    })
                  }
                >
                  + Add row
                </button>
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {customizeDraft.rows.map((r, i) => (
                    <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        style={inp}
                        value={r.row_label}
                        onChange={(e) =>
                          setCustomizeDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  rows: d.rows.map((x, j) => (j === i ? { ...x, row_label: e.target.value } : x)),
                                }
                              : d
                          )
                        }
                      />
                      <button
                        type="button"
                        style={btn}
                        onClick={() =>
                          setCustomizeDraft((d) =>
                            d ? { ...d, rows: d.rows.filter((_, j) => j !== i) } : d
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: 12, marginBottom: 12 }}>
              <strong style={{ fontSize: 13 }}>Save as new template (optional)</strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                <div>
                  <label style={lbl}>Title</label>
                  <input style={inp} value={saveAsName} onChange={(e) => setSaveAsName(e.target.value)} placeholder="e.g. Client A — DRI (spring)" />
                </div>
                <div>
                  <label style={lbl}>Description</label>
                  <textarea
                    style={{ ...inp, resize: "vertical", minHeight: 72 }}
                    rows={3}
                    value={saveAsDescription}
                    onChange={(e) => setSaveAsDescription(e.target.value)}
                    placeholder="Describe when to use this template, client context, or team notes…"
                  />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={btn} onClick={() => setCustomizeOpen(false)}>
                Cancel
              </button>
              <button type="button" style={btnPrimary} onClick={applyCustomizeDraft}>
                Apply to this session
              </button>
              <button type="button" style={{ ...btnPrimary, background: "#2d5a50" }} disabled={savingTemplate} onClick={saveCustomizeAsNewTemplate}>
                {savingTemplate ? "Saving…" : "Save as new template"}
              </button>
            </div>
          </div>
        )}

        {sheetMode !== "legacy" && effectiveTemplate && (
          <div style={{ marginTop: 18 }}>
            <div style={{ ...card, padding: 16 }}>
              <div style={{ marginBottom: 10, fontWeight: "bold" }}>
                {effectiveTemplate.name}
              </div>
              <div style={{ overflowX: "auto" }}>
                {sheetMode === "paper_trial" && (
                  <PaperTrialTable
                    columns={effectiveTemplate.columns}
                    rows={paperRows}
                    values={paperValues}
                    setValues={setPaperValues}
                    inpStyle={inpSheet}
                  />
                )}
                {sheetMode === "paper_dri" && (
                  <PaperDRITable
                    columns={effectiveTemplate.columns}
                    rows={paperRows}
                    values={paperValues}
                    setValues={setPaperValues}
                    inpStyle={inpSheet}
                    dynamicMode={driUseDynamicGrid}
                    driTargets={driDefsEffective}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {sheetMode === "legacy" && (layoutType === "interval" || layoutType === "duration") && effectiveTemplate && (
          <div style={{ marginTop: 18 }}>
            <div style={{ ...card, padding: 16 }}>
              <div style={{ marginBottom: 10, fontWeight: "bold" }}>
                {effectiveTemplate.name}
              </div>
              <div style={{ overflowX: "auto" }}>
                {layoutType === "interval" && (
                  <IntervalTable
                    behaviors={behaviors}
                    templateColumns={effectiveTemplate.columns}
                    rows={effectiveTemplate.rows?.length ? effectiveTemplate.rows : Array.from({ length: 10 }).map((_, i) => ({ id: `tmp-${i}`, row_label: sessionRowLabel(i), order: i }))}
                    showFrequency={effectiveTemplate.columns.some((c) => c.key === "frequency_count")}
                    showDuration={effectiveTemplate.columns.some((c) => c.key === "duration_seconds")}
                    showBehaviorOcc={effectiveTemplate.columns.some((c) => c.key === "behavior_occurrence_note")}
                    inputs={intervalInputs}
                    setInputs={setIntervalInputs}
                    btnStyle={btn}
                    inpStyle={inpSheet}
                  />
                )}
                {layoutType === "duration" && (
                  <DurationTable
                    behaviors={behaviors}
                    templateColumns={effectiveTemplate.columns}
                    rows={effectiveTemplate.rows?.length ? effectiveTemplate.rows : Array.from({ length: 8 }).map((_, i) => ({ id: `tmp-${i}`, row_label: sessionRowLabel(i), order: i }))}
                    showFrequency={effectiveTemplate.columns.some((c) => c.key === "frequency_count")}
                    showDuration={effectiveTemplate.columns.some((c) => c.key === "duration_minutes")}
                    showOccurrence={effectiveTemplate.columns.some((c) => c.key === "occurrence")}
                    inputs={durationInputs}
                    setInputs={setDurationInputs}
                    rowExtras={durationRowExtras}
                    setRowExtras={setDurationRowExtras}
                    btnStyle={btn}
                    inpStyle={inpSheet}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
          {submitError && <div style={{ color: "red", fontSize: 12, marginRight: "auto" }}>{submitError}</div>}
          <button style={btn} onClick={handleReset}>Clear Form</button>
          <button style={btnPrimary} onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving..." : "Save Session"}
          </button>
        </div>
      </main>
    </div>
  );
}

function IntervalTable(props: {
  behaviors: Behavior[];
  templateColumns: BackendTemplateColumn[];
  rows: BackendTemplateRow[];
  showFrequency: boolean;
  showDuration: boolean;
  showBehaviorOcc: boolean;
  inputs: Array<Record<number, IntervalRowInput>>;
  setInputs: React.Dispatch<React.SetStateAction<Array<Record<number, IntervalRowInput>>>>;
  btnStyle: CSSProperties;
  inpStyle: CSSProperties;
}) {
  const {
    behaviors,
    templateColumns,
    rows,
    showFrequency,
    showDuration,
    showBehaviorOcc,
    inputs,
    setInputs,
    btnStyle,
    inpStyle,
  } = props;

  const freqHdr = templateColumns.find((c) => c.key === "frequency_count")?.label?.trim() || "Frequency Count";
  const durHdr = templateColumns.find((c) => c.key === "duration_seconds")?.label?.trim() || "Duration (seconds)";
  const behOccHdr =
    templateColumns.find((c) => c.key === "behavior_occurrence_note")?.label?.trim() || "Occurrence (Yes/No)";
  const intervalOccLabels = binaryChoiceLabelsFromColumnLabel(behOccHdr);

  function setCell(rowIdx: number, behaviorId: number, patch: Partial<IntervalRowInput>) {
    setInputs((prev) => {
      const next = [...prev];
      if (!next[rowIdx]) next[rowIdx] = {};
      next[rowIdx] = { ...next[rowIdx], [behaviorId]: { ...next[rowIdx][behaviorId], ...patch } };
      return next;
    });
  }

  return (
    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 800 }}>
      <thead>
        <tr>
          <th style={{ border: "1px solid #ccc", padding: "6px 8px", background: "#fafafa", position: "sticky", left: 0, zIndex: 2 }}>
            Session
          </th>
          {behaviors.map((b) => (
            <th key={b.id} colSpan={0} style={{ display: "none" }} />
          ))}
          {behaviors.map((b) => (
            <React.Fragment key={`head-${b.id}`}>
              {showFrequency && (
                <th style={{ border: "1px solid #ccc", padding: "6px 8px", background: "#fafafa" }}>
                  {`${b.label} ${freqHdr}`.trim()}
                </th>
              )}
              {showDuration && (
                <th style={{ border: "1px solid #ccc", padding: "6px 8px", background: "#fafafa" }}>
                  {`${b.label} ${durHdr}`.trim()}
                </th>
              )}
              {showBehaviorOcc && (
                <th style={{ border: "1px solid #ccc", padding: "6px 8px", background: "#fafafa" }}>
                  {`${b.label} ${behOccHdr}`.trim()}
                </th>
              )}
            </React.Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIdx) => (
          <tr key={row.id}>
            <td style={{ border: "1px solid #ccc", padding: "6px 8px", background: "#fff", position: "sticky", left: 0, zIndex: 1 }}>
              {sessionRowLabel(rowIdx)}
            </td>
            {behaviors.map((b) => {
              const rowInput = inputs[rowIdx]?.[b.id];
              return (
                <React.Fragment key={`cell-${row.id}-${b.id}`}>
                  {showFrequency && (
                    <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 90 }}>
                      <input
                        style={inpStyle}
                        type="number"
                        step={1}
                        autoComplete="off"
                        value={rowInput?.frequency_count ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCell(rowIdx, b.id, { frequency_count: v === "" ? null : Number(v) });
                        }}
                      />
                    </td>
                  )}
                  {showDuration && (
                    <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 110 }}>
                      <input
                        style={inpStyle}
                        type="number"
                        step={1}
                        autoComplete="off"
                        value={rowInput?.duration_seconds ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCell(rowIdx, b.id, { duration_seconds: v === "" ? null : Number(v) });
                        }}
                      />
                    </td>
                  )}
                  {showBehaviorOcc && (
                    <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 120 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {intervalOccLabels.map((opt, oi) => {
                          const truthy = oi === 0;
                          const active = rowInput?.behavior_occurrence_note === truthy;
                          return (
                            <button
                              key={`occ-${oi}`}
                              style={{
                                ...btnStyle,
                                flex: 1,
                                background: active ? "#4a7c6f" : "#f9f9f9",
                                color: active ? "white" : "#333",
                                borderColor: active ? "#4a7c6f" : "#ccc",
                              }}
                              onClick={() => setCell(rowIdx, b.id, { behavior_occurrence_note: truthy })}
                              type="button"
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  )}
                </React.Fragment>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PaperTrialTable(props: {
  columns: BackendTemplateColumn[];
  rows: Array<{ id: string; row_label: string }>;
  values: Array<PaperRowValues>;
  setValues: React.Dispatch<React.SetStateAction<Array<PaperRowValues>>>;
  inpStyle: CSSProperties;
}) {
  const { columns, rows, values, setValues, inpStyle } = props;
  const { trialDisplayKey, ordered: orderedCols } = paperTrialColumnRoles(columns);

  function setCell(rowIdx: number, key: string, val: string) {
    setValues((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...(next[rowIdx] ?? {}), [key]: val };
      return next;
    });
  }

  const thStyle: CSSProperties = {
    border: "2px solid #222",
    padding: "10px 12px",
    fontSize: 26,
    fontFamily: "Georgia, serif",
    textAlign: "left",
  };
  const tdBase: CSSProperties = { border: "2px solid #222", padding: 6 };

  return (
    <table
      style={{
        borderCollapse: "collapse",
        width: "100%",
        maxWidth: Math.max(700, 120 + orderedCols.length * 140),
      }}
    >
      <thead>
        <tr>
          {orderedCols.map((col) => (
            <th key={col.key} style={thStyle}>
              {col.key === trialDisplayKey ? "Session" : col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, rowIdx) => (
          <tr key={r.id}>
            {orderedCols.map((col) => {
              if (col.key === trialDisplayKey) {
                return (
                  <td
                    key={col.key}
                    style={{
                      ...tdBase,
                      width: 120,
                      textAlign: "right",
                      fontSize: 20,
                      fontFamily: "Georgia, serif",
                    }}
                  >
                    {sessionRowLabel(rowIdx)}
                    <input type="hidden" value={sessionRowLabel(rowIdx)} onChange={() => undefined} />
                  </td>
                );
              }
              return (
                <td key={col.key} style={tdBase}>
                  <input
                    style={{ ...inpStyle, border: "1px solid transparent", fontSize: 16 }}
                    type="number"
                    step={1}
                    value={sheetStrToNumberInputValue(values[rowIdx]?.[col.key])}
                    onChange={(e) => setCell(rowIdx, col.key, e.target.value)}
                    placeholder=""
                    autoComplete="off"
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PaperDRITable(props: {
  columns: BackendTemplateColumn[];
  rows: Array<{ id: string; row_label: string }>;
  values: Array<PaperRowValues>;
  setValues: React.Dispatch<React.SetStateAction<Array<PaperRowValues>>>;
  inpStyle: CSSProperties;
  /** User-saved (non-system) templates: column count follows target definitions */
  dynamicMode?: boolean;
  driTargets?: Array<{ id: number; label: string }>;
}) {
  const { columns, rows, values, setValues, inpStyle, dynamicMode, driTargets } = props;

  function setCell(rowIdx: number, key: string, val: string) {
    setValues((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...(next[rowIdx] ?? {}), [key]: val };
      return next;
    });
  }

  const thBase: CSSProperties = { border: "1px solid #444", padding: "6px 8px", background: "#fff", fontSize: 12, fontWeight: "bold" };
  const tdBase: CSSProperties = { border: "1px solid #444", padding: 4, background: "#fff" };

  if (dynamicMode && driTargets && driTargets.length > 0) {
    const { timeKey, latencyKey, freqKeys } = getDriGridKeys(columns, driTargets, true);
    const timeLabel = columns.find((c) => c.key === timeKey)?.label ?? "Time";
    const latencyLabel = columns.find((c) => c.key === latencyKey)?.label ?? "Latency from snacktime";
    const minW = Math.max(700, 120 + 220 + driTargets.length * 130);

    return (
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: minW }}>
        <thead>
          <tr>
            <th style={thBase}>{timeLabel}</th>
            <th style={{ ...thBase, textAlign: "center", background: "#e9e9e9" }}>{latencyLabel}</th>
            {driTargets.map((t) => (
              <th key={t.id} style={thBase}>
                {t.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, rowIdx) => (
            <tr key={r.id}>
              <td style={{ ...tdBase, minWidth: 120 }}>
                <input
                  style={{ ...inpStyle, border: "1px solid transparent" }}
                  value={values[rowIdx]?.[timeKey] ?? r.row_label}
                  onChange={(e) => setCell(rowIdx, timeKey, e.target.value)}
                  type="text"
                  autoComplete="off"
                />
              </td>
              <td style={{ ...tdBase, minWidth: 220, background: "#e9e9e9" }}>
                <input
                  style={{ ...inpStyle, border: "1px solid transparent", background: "transparent" }}
                  type="number"
                  step={1}
                  value={sheetStrToNumberInputValue(values[rowIdx]?.[latencyKey])}
                  onChange={(e) => setCell(rowIdx, latencyKey, e.target.value)}
                  autoComplete="off"
                />
              </td>
              {freqKeys.map((fk, fi) => (
                <td key={`${fk}-${fi}`} style={{ ...tdBase, minWidth: 130 }}>
                  <input
                    style={{ ...inpStyle, border: "1px solid transparent" }}
                    type="number"
                    step={1}
                    value={sheetStrToNumberInputValue(values[rowIdx]?.[fk])}
                    onChange={(e) => setCell(rowIdx, fk, e.target.value)}
                    autoComplete="off"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const col = (labelIncludes: string, fallbackKey: string) =>
    columns.find((c) => c.label.trim().toLowerCase().includes(labelIncludes)) ?? columns.find((c) => c.key === fallbackKey);

  const timeCol = col("time", "time") ?? columns[0];
  const sibCol =
    col("behavior frequency", "behavior_frequency") ??
    col("sib frequency", "sib_frequency") ??
    columns[1];
  const latencyCol =
    col("latency", "latency_from_snacktime") ??
    col("latency", "latency_from_snacktime_to_sib") ??
    columns[2];
  const sib2Col =
    columns.find((c) => c.key === "behavior_2_frequency") ??
    columns.find((c) => c.key === "sib2_frequency") ??
    columns.find((c) => c.key === "chewy_frequency") ??
    col("behavior 2 frequency", "behavior_2_frequency") ??
    col("sib 2 frequency", "sib2_frequency") ??
    col("chewy frequency", "sib2_frequency") ??
    columns[3];
  const sib3Col =
    columns.find((c) => c.key === "behavior_3_frequency") ??
    columns.find((c) => c.key === "sib3_frequency") ??
    columns.find((c) => c.key === "mouthing_frequency") ??
    col("behavior 3 frequency", "behavior_3_frequency") ??
    col("sib 3 frequency", "sib3_frequency") ??
    col("mouthing frequency", "sib3_frequency") ??
    columns[4];

  return (
    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
      <thead>
        <tr>
          <th style={thBase}>{timeCol?.label ?? "Time"}</th>
          <th style={thBase}>{sibCol?.label ?? "Behavior Frequency"}</th>
          <th style={{ ...thBase, textAlign: "center" }}>{latencyCol?.label ?? "Latency from snacktime"}</th>
          <th style={thBase}>{sib2Col?.label ?? "Behavior 2 Frequency"}</th>
          <th style={thBase}>{sib3Col?.label ?? "Behavior 3 Frequency"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, rowIdx) => (
          <tr key={r.id}>
            <td style={{ ...tdBase, minWidth: 120 }}>
              <input
                style={{ ...inpStyle, border: "1px solid transparent" }}
                value={values[rowIdx]?.[timeCol?.key ?? "time"] ?? r.row_label}
                onChange={(e) => setCell(rowIdx, timeCol?.key ?? "time", e.target.value)}
                type="text"
                autoComplete="off"
              />
            </td>
            <td style={{ ...tdBase, minWidth: 120 }}>
              <input
                style={{ ...inpStyle, border: "1px solid transparent" }}
                type="number"
                step={1}
                value={sheetStrToNumberInputValue(values[rowIdx]?.[sibCol?.key ?? "behavior_frequency"])}
                onChange={(e) => setCell(rowIdx, sibCol?.key ?? "behavior_frequency", e.target.value)}
                autoComplete="off"
              />
            </td>
            <td style={{ ...tdBase, minWidth: 220, background: "#e9e9e9" }}>
              <input
                style={{ ...inpStyle, border: "1px solid transparent", background: "transparent" }}
                type="number"
                step={1}
                value={sheetStrToNumberInputValue(values[rowIdx]?.[latencyCol?.key ?? "latency_from_snacktime"])}
                onChange={(e) =>
                  setCell(rowIdx, latencyCol?.key ?? "latency_from_snacktime", e.target.value)
                }
                autoComplete="off"
              />
            </td>
            <td style={{ ...tdBase, minWidth: 140 }}>
              <input
                style={{ ...inpStyle, border: "1px solid transparent" }}
                type="number"
                step={1}
                value={sheetStrToNumberInputValue(values[rowIdx]?.[sib2Col?.key ?? "behavior_2_frequency"])}
                onChange={(e) => setCell(rowIdx, sib2Col?.key ?? "behavior_2_frequency", e.target.value)}
                autoComplete="off"
              />
            </td>
            <td style={{ ...tdBase, minWidth: 160 }}>
              <input
                style={{ ...inpStyle, border: "1px solid transparent" }}
                type="number"
                step={1}
                value={sheetStrToNumberInputValue(values[rowIdx]?.[sib3Col?.key ?? "behavior_3_frequency"])}
                onChange={(e) => setCell(rowIdx, sib3Col?.key ?? "behavior_3_frequency", e.target.value)}
                autoComplete="off"
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DurationTable(props: {
  behaviors: Behavior[];
  rows: BackendTemplateRow[];
  templateColumns: BackendTemplateColumn[];
  showFrequency: boolean;
  showDuration: boolean;
  showOccurrence: boolean;
  inputs: Array<Record<number, DurationRowInput>>;
  setInputs: React.Dispatch<React.SetStateAction<Array<Record<number, DurationRowInput>>>>;
  rowExtras: Array<Record<string, string>>;
  setRowExtras: React.Dispatch<React.SetStateAction<Array<Record<string, string>>>>;
  btnStyle: CSSProperties;
  inpStyle: CSSProperties;
}) {
  const {
    behaviors,
    rows,
    templateColumns,
    showFrequency,
    showDuration,
    showOccurrence,
    inputs,
    setInputs,
    rowExtras,
    setRowExtras,
    btnStyle,
    inpStyle,
  } = props;

  const nonGridCols = durationNonGridTemplateColumns(templateColumns);
  const freqHdr = templateColumns.find((c) => c.key === "frequency_count")?.label?.trim() || "Frequency Count";
  const durHdr = templateColumns.find((c) => c.key === "duration_minutes")?.label?.trim() || "Duration (Minutes)";
  const occHdr = templateColumns.find((c) => c.key === "occurrence")?.label?.trim() || "Occurrence (Yes/No)";
  const durationOccLabels = binaryChoiceLabelsFromColumnLabel(occHdr);

  function setCell(rowIdx: number, behaviorId: number, patch: Partial<DurationRowInput>) {
    setInputs((prev) => {
      const next = [...prev];
      if (!next[rowIdx]) next[rowIdx] = {};
      next[rowIdx] = { ...next[rowIdx], [behaviorId]: { ...next[rowIdx][behaviorId], ...patch } };
      return next;
    });
  }

  function setExtraCell(rowIdx: number, key: string, val: string) {
    setRowExtras((prev) => {
      const next = [...prev];
      next[rowIdx] = { ...(next[rowIdx] ?? {}), [key]: val };
      return next;
    });
  }

  const thSticky: CSSProperties = {
    border: "1px solid #ccc",
    padding: "6px 8px",
    background: "#fafafa",
    position: "sticky",
    left: 0,
    zIndex: 2,
  };
  const tdSticky: CSSProperties = {
    border: "1px solid #ccc",
    padding: "6px 8px",
    background: "#fff",
    position: "sticky",
    left: 0,
    zIndex: 1,
  };
  const thNorm: CSSProperties = { border: "1px solid #ccc", padding: "6px 8px", background: "#fafafa" };

  const minW = Math.max(800, 160 + nonGridCols.length * 110 + behaviors.length * 200);

  return (
    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: minW }}>
      <thead>
        <tr>
          {nonGridCols.length === 0 && (
            <th style={thSticky}>Session</th>
          )}
          {nonGridCols.map((c, idx) => (
            <th
              key={c.key}
              style={{
                ...thNorm,
                ...(idx === 0 ? { position: "sticky" as const, left: 0, zIndex: 2, background: "#fafafa" } : {}),
              }}
            >
              {idx === 0 ? "Session" : c.label}
            </th>
          ))}
          {behaviors.map((b) => (
            <React.Fragment key={`head-${b.id}`}>
              {showFrequency && (
                <th style={thNorm}>
                  {`${b.label} ${freqHdr}`.trim()}
                </th>
              )}
              {showDuration && (
                <th style={thNorm}>
                  {`${b.label} ${durHdr}`.trim()}
                </th>
              )}
              {showOccurrence && (
                <th style={thNorm}>
                  {`${b.label} ${occHdr}`.trim()}
                </th>
              )}
            </React.Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIdx) => (
          <tr key={row.id}>
            {nonGridCols.length === 0 && <td style={tdSticky}>{sessionRowLabel(rowIdx)}</td>}
            {nonGridCols.map((c, idx) => (
              <td
                key={c.key}
                style={{
                  border: "1px solid #ccc",
                  padding: 4,
                  minWidth: 96,
                  background: "#fff",
                  ...(idx === 0 ? { position: "sticky" as const, left: 0, zIndex: 1 } : {}),
                }}
              >
                {idx > 0 && (c.field_type === "number" || c.field_type === "duration") ? (
                  <input
                    style={inpStyle}
                    type="number"
                    step={1}
                    autoComplete="off"
                    value={sheetStrToNumberInputValue(rowExtras[rowIdx]?.[c.key])}
                    onChange={(e) => setExtraCell(rowIdx, c.key, e.target.value)}
                    placeholder={isDurationTrialColumnKey(c.key) ? sessionRowLabel(rowIdx) : ""}
                  />
                ) : (
                  <input
                    style={inpStyle}
                    type="text"
                    autoComplete="off"
                    value={rowExtras[rowIdx]?.[c.key] ?? ""}
                    onChange={(e) => setExtraCell(rowIdx, c.key, e.target.value)}
                    placeholder={isDurationTrialColumnKey(c.key) ? sessionRowLabel(rowIdx) : ""}
                  />
                )}
              </td>
            ))}
            {behaviors.map((b) => {
              const rowInput = inputs[rowIdx]?.[b.id];
              return (
                <React.Fragment key={`cell-${row.id}-${b.id}`}>
                  {showFrequency && (
                    <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 90 }}>
                      <input
                        style={inpStyle}
                        type="number"
                        step={1}
                        autoComplete="off"
                        value={rowInput?.frequency_count ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCell(rowIdx, b.id, { frequency_count: v === "" ? null : Number(v) });
                        }}
                      />
                    </td>
                  )}
                  {showDuration && (
                    <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 110 }}>
                      <input
                        style={inpStyle}
                        type="number"
                        step={1}
                        autoComplete="off"
                        value={rowInput?.duration_minutes ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCell(rowIdx, b.id, { duration_minutes: v === "" ? null : Number(v) });
                        }}
                      />
                    </td>
                  )}
                  {showOccurrence && (
                    <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 120 }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {durationOccLabels.map((opt, oi) => {
                          const truthy = oi === 0;
                          const active = rowInput?.occurrence === truthy;
                          return (
                            <button
                              key={`dur-occ-${oi}`}
                              style={{
                                ...btnStyle,
                                flex: 1,
                                background: active ? "#4a7c6f" : "#f9f9f9",
                                color: active ? "white" : "#333",
                                borderColor: active ? "#4a7c6f" : "#ccc",
                              }}
                              onClick={() => setCell(rowIdx, b.id, { occurrence: truthy })}
                              type="button"
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  )}
                </React.Fragment>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

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
    <aside style={{ width: 200, background: "#5b8278", color: "white", padding: 16, display: "flex", flexDirection: "column", gap: 4, fontFamily: "Arial, sans-serif", flexShrink: 0 }}>
      <div style={{ fontWeight: "bold", fontSize: 16, marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #4a5e56" }}>Observa</div>
      {navItems.map((item) => {
        const isActive = itemIsActive(item.label);
        return (
        <button key={item.label}
          style={{ background: isActive ? "rgba(255,255,255,0.15)" : "none", border: "none", color: isActive ? "white" : "rgba(255,255,255,0.6)", padding: "8px 10px", cursor: item.path ? "pointer" : "default", textAlign: "left", width: "100%", fontSize: 13, borderRadius: 4, opacity: item.path ? 1 : 0.45 }}
          onClick={() => item.path && navigate(item.path)}>
          {item.label}
        </button>
        );
      })}
      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid #4a5e56" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
          <div style={{ fontWeight: "bold", color: "white" }}>{user.username}</div>
          <div>{user.role.toUpperCase()}</div>
        </div>
        <button style={logoutBtn} onClick={() => { localStorage.clear(); navigate("/"); }}>Sign Out</button>
      </div>
    </aside>
  );
}

