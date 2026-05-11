/**
 * Derive chart Y-values from DataEntry rows across all datasheet templates.
 * Primary fields (frequency_count, duration_*, occurrence) are used first;
 * when those are zero or absent, we read template-specific keys from custom_values
 * (DRI grids, paper trial response column, etc.) — see backend/datasheet/GRAPHING_DATA.md.
 */

export interface GraphBehavior {
  id: string;
  tracking_type: "FREQ" | "DUR" | "PIR" | "WIR";
}

export interface GraphEntry {
  behavior: string;
  frequency_count: number;
  duration_seconds: number | null;
  duration_minutes: number | null;
  occurrence: boolean | null;
  custom_values: Record<string, unknown>;
}

/** Canonical frequency column keys per behavior index (DRI / legacy SIB naming). */
const FREQ_KEYS_BY_INDEX: string[][] = [
  ["behavior_frequency", "sib_frequency"],
  ["behavior_2_frequency", "sib2_frequency", "chewy_frequency"],
  ["behavior_3_frequency", "sib3_frequency", "mouthing_frequency"],
];

function parseFiniteNumber(v: unknown): number {
  if (v === undefined || v === null || v === "") return NaN;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function durationMinutesFromEntry(entry: GraphEntry): number {
  const dm = entry.duration_minutes ?? 0;
  const ds = entry.duration_seconds ?? 0;
  let total = dm + ds / 60;
  if (total > 0) return total;

  const cv = entry.custom_values;
  if (!cv || typeof cv !== "object") return 0;
  const rec = cv as Record<string, unknown>;
  for (const k of ["duration", "duration_seconds", "duration_minutes"]) {
    const n = parseFiniteNumber(rec[k]);
    if (Number.isFinite(n) && n > 0) {
      // Paper grid / forms often store duration in seconds
      return k === "duration_minutes" ? n : n / 60;
    }
  }
  return 0;
}

/**
 * When frequency_count is 0, pull a numeric from custom_values (per-template cells).
 */
function frequencyFallbackFromCustomValues(entry: GraphEntry, behaviorIndex: number): number {
  const cv = entry.custom_values;
  if (!cv || typeof cv !== "object") return 0;
  const rec = cv as Record<string, unknown>;

  const idxKeys = FREQ_KEYS_BY_INDEX[behaviorIndex] ?? [];
  for (const k of idxKeys) {
    const n = parseFiniteNumber(rec[k]);
    if (Number.isFinite(n)) return n;
  }

  const resp = parseFiniteNumber(rec["response"]);
  if (Number.isFinite(resp)) return resp;

  let sum = 0;
  for (const [k, v] of Object.entries(rec)) {
    if (!k.toLowerCase().includes("frequency")) continue;
    const n = parseFiniteNumber(v);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

/**
 * Single numeric contribution for charts for one DataEntry row and one behavior definition.
 */
export function metricFromEntryForGraph(
  behavior: GraphBehavior,
  behaviorIndex: number,
  entry: GraphEntry,
): number {
  switch (behavior.tracking_type) {
    case "DUR":
      return durationMinutesFromEntry(entry);
    case "PIR":
    case "WIR": {
      const fc = entry.frequency_count ?? 0;
      if (fc > 0) return fc;
      if (entry.occurrence === true) return 1;
      if (entry.occurrence === false) return 0;
      return frequencyFallbackFromCustomValues(entry, behaviorIndex);
    }
    case "FREQ":
    default: {
      const fc = entry.frequency_count ?? 0;
      if (fc > 0) return fc;
      return frequencyFallbackFromCustomValues(entry, behaviorIndex);
    }
  }
}

/** User-selected Y-axis: primary follows tracking type; others map to raw fields. */
export type GraphYMeasure = "primary" | "frequency" | "duration" | "occurrence";

function frequencyValueFromEntry(entry: GraphEntry, behaviorIndex: number): number {
  const fc = entry.frequency_count ?? 0;
  if (fc > 0) return fc;
  return frequencyFallbackFromCustomValues(entry, behaviorIndex);
}

export function yAxisLabelForMeasure(
  measure: GraphYMeasure,
  trackingType: GraphBehavior["tracking_type"],
): string {
  if (measure === "primary") {
    return trackingType === "DUR"
      ? "Duration (minutes)"
      : trackingType === "PIR" || trackingType === "WIR"
        ? "Occurrences"
        : "Frequency (count)";
  }
  if (measure === "frequency") return "Frequency (count)";
  if (measure === "duration") return "Duration (minutes)";
  if (measure === "occurrence") return "Occurrence (0 / 1)";
  return "Value";
}

export function valueForGraphMeasure(
  behavior: GraphBehavior,
  behaviorIndex: number,
  entry: GraphEntry,
  measure: GraphYMeasure,
): number {
  if (measure === "primary") {
    return metricFromEntryForGraph(behavior, behaviorIndex, entry);
  }
  if (measure === "frequency") {
    return frequencyValueFromEntry(entry, behaviorIndex);
  }
  if (measure === "duration") {
    return durationMinutesFromEntry(entry);
  }
  if (measure === "occurrence") {
    if (entry.occurrence === true) return 1;
    if (entry.occurrence === false) return 0;
    if (behavior.tracking_type === "DUR") {
      return durationMinutesFromEntry(entry) > 0 ? 1 : 0;
    }
    return frequencyValueFromEntry(entry, behaviorIndex) > 0 ? 1 : 0;
  }
  return 0;
}
