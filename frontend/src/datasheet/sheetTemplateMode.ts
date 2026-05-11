/**
 * Shared template layout detection + DRI / paper-trial column helpers.
 * Used by Data Entry and Client Datasheets so “finished” views stay consistent.
 */

export interface BackendTemplateColumn {
  id: string;
  key: string;
  label: string;
  field_type: string;
  order: number;
  required: boolean;
}

export interface BackendTemplateRow {
  id: string;
  row_label: string;
  order: number;
}

export interface BackendTemplateDetails {
  id: string;
  name: string;
  description?: string | null;
  columns: BackendTemplateColumn[];
  rows: BackendTemplateRow[];
  is_system_template?: boolean;
  is_active?: boolean;
}

export type SheetMode = "paper_trial" | "paper_dri" | "legacy";

/** First-column row label for paper trial, interval, and duration sheets. */
export function sessionRowLabel(rowIndex: number): string {
  return `Session ${rowIndex + 1}`;
}

/** Per-row trial index column on Duration & Frequency layout (existing DBs may still use `minute`). */
export function isDurationTrialColumnKey(key: string | undefined | null): boolean {
  return key === "trial_key" || key === "minute";
}

export function isDurationFrequencySessionTemplate(t: BackendTemplateDetails | null): boolean {
  if (!t?.name) return false;
  const n = t.name.trim().toLowerCase();
  return n === "duration frequency session" || n === "duration and frequency session";
}

export function getLayoutType(templateDetails: BackendTemplateDetails | null): "interval" | "duration" | "other" {
  if (!templateDetails) return "other";
  if (templateDetails.columns.some((c) => c.key === "trial_number" || c.key === "session_number")) {
    return "interval";
  }
  if (templateDetails.columns.some((c) => isDurationTrialColumnKey(c.key))) return "duration";
  return "other";
}

function looksLikeDriSheet(t: BackendTemplateDetails): boolean {
  const cols = t.columns;
  const keys = new Set(cols.map((c) => c.key));
  const hasFreq2 =
    keys.has("behavior_2_frequency") || keys.has("sib2_frequency") || keys.has("chewy_frequency");
  const hasFreq3 =
    keys.has("behavior_3_frequency") || keys.has("sib3_frequency") || keys.has("mouthing_frequency");
  if (
    keys.has("time") &&
    ((keys.has("behavior_frequency") && hasFreq2 && hasFreq3) ||
      (keys.has("sib_frequency") && hasFreq2 && hasFreq3))
  ) {
    return true;
  }
  const name = (t.name ?? "").trim().toLowerCase();
  if (name.includes("frequency") && (name.includes("sib") || name.includes("behavior frequency"))) {
    return true;
  }
  const labels = cols.map((c) => c.label.trim().toLowerCase());
  const hasTime = keys.has("time") || labels.some((l) => l === "time");
  const hasLatency = cols.some(
    (c) => c.key.toLowerCase().includes("latency") || c.label.toLowerCase().includes("latency")
  );
  const freqLike = cols.filter((c) => {
    const l = c.label.toLowerCase();
    if (l === "time") return false;
    if (l.includes("latency")) return false;
    return l.includes("frequency") || (c.field_type === "number" && !l.includes("latency"));
  });
  if (hasTime && hasLatency && freqLike.length >= 2) return true;
  return false;
}

function looksLikePaperTrialStructure(t: BackendTemplateDetails): boolean {
  const keys = new Set(t.columns.map((c) => c.key));
  const name = (t.name ?? "").trim().toLowerCase();
  if (looksLikeDriSheet(t)) return false;
  if (keys.has("behavior")) return false;
  if (keys.has("trial_key") || keys.has("minute")) return false;
  const labels = t.columns.map((c) => c.label.trim().toLowerCase());
  if (
    (labels.includes("trial") || labels.includes("session")) &&
    labels.includes("response") &&
    labels.includes("duration")
  ) {
    return true;
  }
  if (keys.has("session_number") && keys.has("response") && keys.has("duration")) return true;
  if (name === "data sheet" || name === "data sheet:" || name === "data sheet :") return true;
  return t.columns.length >= 2;
}

/**
 * Map session (trial) / response / duration for paper grid + submit.
 */
export function paperTrialColumnRoles(cols: BackendTemplateColumn[]): {
  ordered: BackendTemplateColumn[];
  trialKey: string;
  trialDisplayKey: string;
  responseKey: string | null;
  durationKey: string | null;
} {
  const ordered = [...cols].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (ordered.length === 0) {
    return {
      ordered,
      trialKey: "session_number",
      trialDisplayKey: "session_number",
      responseKey: null,
      durationKey: null,
    };
  }

  const trialCol =
    ordered.find((c) => c.key === "session_number") ??
    ordered.find((c) => c.key === "trial_number") ??
    ordered[0]!;
  const trialKey = trialCol.key;
  const trialDisplayKey = trialKey;
  const trialIdx = ordered.indexOf(trialCol);

  let durationKey: string | null = ordered.find((c) => c.key === "duration")?.key ?? null;
  if (!durationKey && ordered.length >= 3) {
    const last = ordered[ordered.length - 1]!;
    if (last.key !== trialKey) {
      durationKey = last.key;
    }
  } else if (!durationKey && ordered.length === 2) {
    const second = ordered[1]!;
    if (second.key === "duration") {
      durationKey = second.key;
    }
  }

  let responseKey: string | null = ordered.find((c) => c.key === "response")?.key ?? null;
  if (!responseKey) {
    const nextIdx = trialIdx + 1;
    if (nextIdx < ordered.length) {
      const next = ordered[nextIdx]!;
      if (next.key !== trialKey && next.key !== durationKey) {
        responseKey = next.key;
      }
    }
  }

  if (responseKey && durationKey && responseKey === durationKey) {
    responseKey = ordered.find((c) => c.key === "response")?.key ?? null;
    if (!responseKey && trialIdx + 1 < ordered.length) {
      const next = ordered[trialIdx + 1]!;
      if (next.key !== trialKey && next.key !== durationKey) {
        responseKey = next.key;
      }
    }
  }

  return { ordered, trialKey, trialDisplayKey, responseKey, durationKey };
}

export function getSheetMode(t: BackendTemplateDetails | null): SheetMode {
  if (!t?.columns?.length) return "legacy";
  const keys = new Set(t.columns.map((c) => c.key));
  const name = t.name?.trim() ?? "";

  /** Retired Maladaptive sheet — old rows in DB still match this shape; use legacy entry path. */
  if (
    name === "Maladaptive Behavior Data Sheet" ||
    keys.has("shift_12a_8a_bx_1") ||
    ([...keys].some((k) => k.startsWith("shift_12a_8a_")) && keys.has("date"))
  ) {
    return "legacy";
  }
  if (looksLikeDriSheet(t)) {
    return "paper_dri";
  }
  if (looksLikePaperTrialStructure(t)) {
    return "paper_trial";
  }
  return "legacy";
}

/** Columns that represent frequency targets for DRI (excludes Time + Latency). */
export function templateColumnsForDriBehaviors(cols: BackendTemplateColumn[]): BackendTemplateColumn[] {
  const timeKey = cols.find((c) => c.label.trim().toLowerCase() === "time")?.key ?? "time";
  const latencyKey = cols.find((c) => c.label.toLowerCase().includes("latency"))?.key;
  return cols
    .filter((c) => {
      if (c.key === timeKey) return false;
      if (latencyKey && c.key === latencyKey) return false;
      if (c.label.toLowerCase().includes("latency")) return false;
      return true;
    })
    .sort((a, b) => a.order - b.order);
}

/** DRI grid keys: canonical `behavior_*` + latency columns (legacy `sib_*` supported). */
export function getDriGridKeys(
  columns: BackendTemplateColumn[],
  driTargets: Array<{ id: number }>,
  dynamic: boolean
): { timeKey: string; latencyKey: string; freqKeys: string[] } {
  const timeKey = columns.find((c) => c.label.trim().toLowerCase() === "time")?.key ?? "time";
  const latencyKey =
    columns.find((c) => c.label.trim().toLowerCase().includes("latency"))?.key ??
    columns.find((c) => c.key === "latency_from_snacktime")?.key ??
    columns.find((c) => c.key === "latency_from_snacktime_to_sib")?.key ??
    "latency_from_snacktime";

  if (!dynamic) {
    const freq1 =
      columns.find((c) => c.key === "behavior_frequency")?.key ??
      columns.find((c) => c.key === "sib_frequency")?.key ??
      "behavior_frequency";
    const freq2 =
      columns.find((c) => c.key === "behavior_2_frequency")?.key ??
      columns.find((c) => c.key === "sib2_frequency")?.key ??
      columns.find((c) => c.key === "chewy_frequency")?.key ??
      "behavior_2_frequency";
    const freq3 =
      columns.find((c) => c.key === "behavior_3_frequency")?.key ??
      columns.find((c) => c.key === "sib3_frequency")?.key ??
      columns.find((c) => c.key === "mouthing_frequency")?.key ??
      "behavior_3_frequency";
    return { timeKey, latencyKey, freqKeys: [freq1, freq2, freq3] };
  }

  const freqCols = columns
    .filter((c) => {
      if (c.key === timeKey || c.key === latencyKey) return false;
      if (c.label.trim().toLowerCase().includes("latency")) return false;
      return c.field_type === "number" || c.key.toLowerCase().includes("frequency");
    })
    .sort((a, b) => a.order - b.order);

  const freqKeys = driTargets.map((t, i) => {
    if (i < freqCols.length) return freqCols[i].key;
    return `dri_session_freq_${t.id}`;
  });
  return { timeKey, latencyKey, freqKeys };
}
