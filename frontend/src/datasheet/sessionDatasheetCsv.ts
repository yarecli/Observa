/**
 * Human-readable CSV export aligned with Client Datasheet preview (summary + template-shaped grids).
 */

import type { BackendTemplateColumn, BackendTemplateDetails, BackendTemplateRow } from "./sheetTemplateMode";
import {
  getDriGridKeys,
  getLayoutType,
  getSheetMode,
  isDurationFrequencySessionTemplate,
  isDurationTrialColumnKey,
  paperTrialColumnRoles,
  sessionRowLabel,
  templateColumnsForDriBehaviors,
} from "./sheetTemplateMode";
import type { SessionEntryView, SessionViewModel } from "../pages/ClientDatasheetPreview";

function csvEscapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(cells: string[]): string {
  return cells.map(csvEscapeCell).join(",");
}

const DURATION_BEHAVIOR_GRID_KEYS = new Set(["frequency_count", "duration_minutes", "occurrence"]);

function durationNonGridTemplateColumns(cols: BackendTemplateColumn[]): BackendTemplateColumn[] {
  return [...cols]
    .filter(
      (c) =>
        isDurationTrialColumnKey(c.key) ||
        (c.key.startsWith("custom_") && !DURATION_BEHAVIOR_GRID_KEYS.has(c.key))
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function col(
  columns: BackendTemplateColumn[],
  labelIncludes: string,
  fallbackKey: string
): BackendTemplateColumn | undefined {
  return (
    columns.find((c) => c.label.trim().toLowerCase().includes(labelIncludes)) ??
    columns.find((c) => c.key === fallbackKey)
  );
}

function binaryChoiceLabelsFromColumnLabel(label: string | undefined | null): [string, string] {
  const DEFAULT: [string, string] = ["Yes", "No"];
  const t = (label ?? "").trim();
  if (!t) return DEFAULT;
  const open = t.lastIndexOf("(");
  const close = t.lastIndexOf(")");
  if (open === -1 || close <= open) return DEFAULT;
  const inner = t.slice(open + 1, close).trim();
  const slash = inner.indexOf("/");
  if (slash === -1) return DEFAULT;
  const a = inner.slice(0, slash).trim();
  const b = inner.slice(slash + 1).trim();
  if (!a || !b) return DEFAULT;
  return [a, b];
}

function firstCustomColumn(customColumns: unknown[] | undefined): Record<string, unknown> | null {
  if (!Array.isArray(customColumns) || customColumns.length === 0) return null;
  const x = customColumns[0];
  return x && typeof x === "object" ? (x as Record<string, unknown>) : null;
}

function groupEntriesByTrial(entries: SessionEntryView[]): Map<number, SessionEntryView[]> {
  const m = new Map<number, SessionEntryView[]>();
  for (const e of entries) {
    const tn = e.trial_number ?? 1;
    if (!m.has(tn)) m.set(tn, []);
    m.get(tn)!.push(e);
  }
  const keys = [...m.keys()].sort((a, b) => a - b);
  return new Map(keys.map((k) => [k, m.get(k)!]));
}

function sessionNotes(entries: SessionEntryView[]): string {
  for (const e of entries) {
    const n = e.custom_values?.notes;
    if (typeof n === "string" && n.trim()) return n;
  }
  return "";
}

function behaviorOrder(session: SessionViewModel, entries: SessionEntryView[]): string[] {
  if (session.selected_behaviors && session.selected_behaviors.length > 0) {
    return [...session.selected_behaviors];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    if (!seen.has(e.behavior)) {
      seen.add(e.behavior);
      out.push(e.behavior);
    }
  }
  return out;
}

const META_SKIP = new Set(["notes", "graph_key", "behavior_label"]);

function durationExtrasFromEntry(cv: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cv) return out;
  for (const [k, v] of Object.entries(cv)) {
    if (META_SKIP.has(k)) continue;
    if (v === null || v === undefined) out[k] = "";
    else if (typeof v === "object") continue;
    else out[k] = String(v);
  }
  return out;
}

function yesNo(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  return v ? "Yes" : "No";
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function buildHumanReadableDatasheetCsv(opts: {
  session: SessionViewModel;
  templateDetails: BackendTemplateDetails | null;
  templateListName: string;
  behaviorIdToName: Map<string, string>;
  clientDisplayName: string;
  dataCollectorName?: string;
}): string {
  const { session, templateDetails, templateListName, behaviorIdToName, clientDisplayName, dataCollectorName } = opts;
  const entries = session.entries ?? [];
  const notes = sessionNotes(entries);
  const passage = (session.passage_of_time ?? "").trim();
  const lines: string[] = [];

  const sheetMode = templateDetails ? getSheetMode(templateDetails) : "legacy";
  const layoutType = templateDetails ? getLayoutType(templateDetails) : "other";

  const templateTitle =
    templateDetails?.name?.trim() ||
    (session.template ? templateListName : "Default") ||
    "Data sheet";

  const behaviorsOrdered = behaviorOrder(session, entries);
  const viewBehaviors = behaviorsOrdered.map((id) => ({
    id,
    label:
      entries.find((e) => e.behavior === id)?.custom_values?.behavior_label != null
        ? String(entries.find((e) => e.behavior === id)!.custom_values!.behavior_label)
        : behaviorIdToName.get(id) ?? id.slice(0, 8),
  }));

  /** ----- Summary (two columns, same labels as on-screen Summary) ----- */
  lines.push(csvRow(["Label", "Value"]));
  lines.push(csvRow(["Client", clientDisplayName]));
  if (dataCollectorName) lines.push(csvRow(["Collected by", dataCollectorName]));
  lines.push(csvRow(["Session date", formatSessionDate(session.date)]));
  lines.push(csvRow(["Template", templateTitle]));
  if (session.session_number != null) lines.push(csvRow(["Session #", String(session.session_number)]));
  if (passage) lines.push(csvRow(["Time", passage]));
  if (
    session.minute != null &&
    templateDetails &&
    isDurationFrequencySessionTemplate(templateDetails)
  ) {
    lines.push(csvRow(["Minute", String(session.minute)]));
  }
  if (sheetMode === "paper_trial" && firstCustomColumn(session.custom_columns)?.behavior_occurred != null) {
    lines.push(csvRow(["Occurred", String(firstCustomColumn(session.custom_columns)!.behavior_occurred)]));
  }
  if (
    layoutType === "other" &&
    sheetMode === "legacy" &&
    entries.some((e) => {
      const m = e.custom_values?.measurement;
      return (m != null && String(m).trim() !== "") || e.occurrence === true;
    })
  ) {
    const perBehavior = entries
      .map((e, i) => {
        const label =
          (e.custom_values?.behavior_label != null
            ? String(e.custom_values.behavior_label)
            : behaviorIdToName.get(e.behavior)) ?? `Behavior ${i + 1}`;
        const meas = e.custom_values?.measurement != null ? String(e.custom_values.measurement) : "";
        const val =
          e.frequency_count != null && e.frequency_count > 0
            ? String(e.frequency_count)
            : e.duration_minutes != null
              ? String(e.duration_minutes)
              : e.duration_seconds != null
                ? String(Math.round(e.duration_seconds / 60))
                : "";
        const occurred = e.occurrence ? "Yes" : "No";
        if (!meas && !e.occurrence) return null;
        const measPart = meas ? `${meas}${val ? ` — ${val}` : ""}` : "—";
        return `${label}: ${occurred}; ${measPart}`;
      })
      .filter(Boolean)
      .join(" · ");
    if (perBehavior) lines.push(csvRow(["Per behavior", perBehavior]));
  }
  if (
    (sheetMode === "paper_trial" || sheetMode === "paper_dri") &&
    firstCustomColumn(session.custom_columns)?.behaviors != null &&
    Array.isArray(firstCustomColumn(session.custom_columns)!.behaviors)
  ) {
    const labels = (firstCustomColumn(session.custom_columns)!.behaviors as { label: string }[])
      .map((b) => b.label)
      .join(", ");
    lines.push(csvRow(["Behaviors", labels]));
  }
  if (
    sheetMode === "paper_dri" &&
    firstCustomColumn(session.custom_columns)?.target_behavior_definitions != null &&
    Array.isArray(firstCustomColumn(session.custom_columns)!.target_behavior_definitions)
  ) {
    const labels = (
      firstCustomColumn(session.custom_columns)!.target_behavior_definitions as { label: string }[]
    )
      .map((b) => b.label)
      .join(", ");
    lines.push(csvRow(["Behaviors", labels]));
  }
  if (sheetMode === "legacy" && viewBehaviors.length > 0) {
    lines.push(csvRow(["Behaviors", viewBehaviors.map((b) => b.label).join(", ")]));
  }
  if (notes.trim()) lines.push(csvRow(["Session notes", notes]));

  lines.push(csvRow([]));

  /** ----- Data grid(s) ----- */
  if (!templateDetails || entries.length === 0) {
    lines.push(csvRow(["Data", ""]));
    lines.push(csvRow(["#", "Behavior", "Details"]));
    entries.forEach((e, i) => {
      const name =
        (e.custom_values?.behavior_label != null
          ? String(e.custom_values.behavior_label)
          : behaviorIdToName.get(e.behavior)) ?? e.behavior;
      const cv = e.custom_values as Record<string, unknown> | undefined;
      let detail = "";
      if (cv) {
        const { notes: n, ...rest } = cv as Record<string, unknown>;
        const parts: string[] = [];
        if (typeof n === "string" && n.trim()) parts.push(`Notes: ${n}`);
        const restStr = JSON.stringify(rest);
        if (restStr !== "{}") parts.push(restStr);
        detail = parts.join(" | ");
      }
      lines.push(csvRow([String(i + 1), name, detail]));
    });
    return lines.join("\r\n");
  }

  const byTrial = groupEntriesByTrial(entries);
  const rowIndices = [...byTrial.keys()].sort((a, b) => a - b);

  /** Paper trial — Session/Response/Duration style */
  if (sheetMode === "paper_trial") {
    const cols = templateDetails.columns ?? [];
    const { trialDisplayKey, ordered: orderedCols } = paperTrialColumnRoles(cols);
    lines.push(csvRow(["Data sheet", templateDetails.name]));
    const header = orderedCols.map((col) =>
      col.key === trialDisplayKey ? "Session" : col.label.trim() || col.key
    );
    lines.push(csvRow(header));
    rowIndices.forEach((trialNum, rowIdx) => {
      const group = byTrial.get(trialNum) ?? [];
      const src = (group[0]?.custom_values ?? {}) as Record<string, unknown>;
      const cells = orderedCols.map((c) => {
        if (c.key === trialDisplayKey) return sessionRowLabel(rowIdx);
        const raw = src[c.key];
        if (raw === null || raw === undefined) return "";
        return String(raw);
      });
      lines.push(csvRow(cells));
    });
    return lines.join("\r\n");
  }

  /** Paper DRI */
  if (sheetMode === "paper_dri") {
    const meta = firstCustomColumn(session.custom_columns);
    const defsRaw = meta?.target_behavior_definitions;
    const driTargets: Array<{ id: number; label: string }> = Array.isArray(defsRaw)
      ? (defsRaw as { label: string }[]).map((d, i) => ({ id: i + 1, label: d.label }))
      : templateColumnsForDriBehaviors(templateDetails.columns ?? []).map((c, i) => ({
          id: i + 1,
          label: c.label,
        }));
    const dynamic = meta?.dri_grid_mode === "dynamic";
    const cols = templateDetails.columns ?? [];
    const { timeKey, latencyKey, freqKeys } = getDriGridKeys(cols, driTargets, dynamic);

    lines.push(csvRow(["Data sheet", templateDetails.name]));

    if (dynamic && driTargets.length > 0) {
      const timeLabel = cols.find((c) => c.key === timeKey)?.label ?? "Time";
      const latencyLabel = cols.find((c) => c.key === latencyKey)?.label ?? "Latency";
      const header = [timeLabel, latencyLabel, ...driTargets.map((t) => t.label)];
      lines.push(csvRow(header));
      rowIndices.forEach((trialNum, rowIdx) => {
        const group = byTrial.get(trialNum) ?? [];
        const ordered = behaviorOrder(session, group)
          .map((bid) => group.find((e) => e.behavior === bid))
          .filter(Boolean) as SessionEntryView[];
        const first = ordered[0];
        const timeVal =
          (first?.custom_values?.[timeKey] != null ? String(first.custom_values![timeKey]) : "") ||
          (first?.row_label != null ? String(first.row_label) : "") ||
          (first?.time_interval != null ? String(first.time_interval) : "") ||
          sessionRowLabel(rowIdx);
        const latRaw = first?.custom_values?.[latencyKey];
        const latStr = latRaw !== undefined && latRaw !== null ? String(latRaw) : "";
        const freqCells = freqKeys.map((_, fi) => {
          const e = ordered[fi];
          return e?.frequency_count != null ? String(e.frequency_count) : "";
        });
        lines.push(csvRow([timeVal, latStr, ...freqCells]));
      });
      return lines.join("\r\n");
    }

    if (!dynamic && driTargets.length > 0) {
      const timeCol = col(cols, "time", "time") ?? cols[0];
      const sibCol =
        col(cols, "behavior frequency", "behavior_frequency") ??
        col(cols, "sib frequency", "sib_frequency") ??
        cols[1];
      const latencyCol =
        col(cols, "latency", "latency_from_snacktime") ??
        col(cols, "latency", "latency_from_snacktime_to_sib") ??
        cols[2];
      const sib2Col =
        cols.find((c) => c.key === "behavior_2_frequency") ??
        cols.find((c) => c.key === "sib2_frequency") ??
        cols[3];
      const sib3Col =
        cols.find((c) => c.key === "behavior_3_frequency") ??
        cols.find((c) => c.key === "sib3_frequency") ??
        cols[4];
      const lk = latencyCol?.key ?? "latency_from_snacktime";
      lines.push(
        csvRow([
          timeCol?.label ?? "Time",
          sibCol?.label ?? "Behavior Frequency",
          latencyCol?.label ?? "Latency",
          sib2Col?.label ?? "Behavior 2 Frequency",
          sib3Col?.label ?? "Behavior 3 Frequency",
        ])
      );
      rowIndices.forEach((trialNum, rowIdx) => {
        const group = byTrial.get(trialNum) ?? [];
        const ordered = behaviorOrder(session, group)
          .map((bid) => group.find((e) => e.behavior === bid))
          .filter(Boolean) as SessionEntryView[];
        const e0 = ordered[0];
        const e1 = ordered[1];
        const e2 = ordered[2];
        const tk = timeCol?.key ?? "time";
        const timeVal =
          (e0?.custom_values?.[tk] != null ? String(e0.custom_values![tk]) : "") ||
          (e0?.row_label != null ? String(e0.row_label) : "") ||
          sessionRowLabel(rowIdx);
        const latRaw = e0?.custom_values?.[lk];
        lines.push(
          csvRow([
            timeVal,
            e0?.frequency_count != null ? String(e0.frequency_count) : "",
            latRaw !== undefined && latRaw !== null ? String(latRaw) : "",
            e1?.frequency_count != null ? String(e1.frequency_count) : "",
            e2?.frequency_count != null ? String(e2.frequency_count) : "",
          ])
        );
      });
      return lines.join("\r\n");
    }

    lines.push(csvRow(["", "DRI layout could not be exported automatically. Use Summary above or open the app view."]));
    return lines.join("\r\n");
  }

  /** Legacy interval */
  if (sheetMode === "legacy" && layoutType === "interval") {
    const tc = templateDetails.columns ?? [];
    const showFrequency = tc.some((c) => c.key === "frequency_count");
    const showDuration = tc.some((c) => c.key === "duration_seconds");
    const showBehaviorOcc = tc.some((c) => c.key === "behavior_occurrence_note");
    const freqHdr = tc.find((c) => c.key === "frequency_count")?.label?.trim() || "Frequency Count";
    const durHdr = tc.find((c) => c.key === "duration_seconds")?.label?.trim() || "Duration (seconds)";
    const behOccHdr =
      tc.find((c) => c.key === "behavior_occurrence_note")?.label?.trim() || "Occurrence (Yes/No)";
    const occLabels = binaryChoiceLabelsFromColumnLabel(behOccHdr);
    const rows: BackendTemplateRow[] =
      templateDetails.rows?.length > 0
        ? templateDetails.rows
        : Array.from({ length: 10 }).map((_, i) => ({
            id: `tmp-${i}`,
            row_label: sessionRowLabel(i),
            order: i,
          }));

    lines.push(csvRow(["Data sheet", templateDetails.name]));
    const header: string[] = ["Session"];
    for (const b of viewBehaviors) {
      if (showFrequency) header.push(`${b.label} ${freqHdr}`.trim());
      if (showDuration) header.push(`${b.label} ${durHdr}`.trim());
      if (showBehaviorOcc) header.push(`${b.label} ${behOccHdr}`.trim());
    }
    lines.push(csvRow(header));

    rows.forEach((_row, rowIdx) => {
      const trialNum = rowIdx + 1;
      const group = byTrial.get(trialNum) ?? [];
      const cells: string[] = [sessionRowLabel(rowIdx)];
      for (const b of viewBehaviors) {
        const e = group.find((x) => x.behavior === b.id);
        if (showFrequency) cells.push(e?.frequency_count != null ? String(e.frequency_count) : "");
        if (showDuration) cells.push(e?.duration_seconds != null ? String(e.duration_seconds) : "");
        if (showBehaviorOcc) {
          const v = e?.behavior_occurrence_note;
          if (v === true) cells.push(occLabels[0] ?? "Yes");
          else if (v === false) cells.push(occLabels[1] ?? "No");
          else cells.push("");
        }
      }
      lines.push(csvRow(cells));
    });
    return lines.join("\r\n");
  }

  /** Legacy duration */
  if (sheetMode === "legacy" && layoutType === "duration") {
    const tc = templateDetails.columns ?? [];
    const showFrequency = tc.some((c) => c.key === "frequency_count");
    const showDuration = tc.some((c) => c.key === "duration_minutes");
    const showOccurrence = tc.some((c) => c.key === "occurrence");
    const freqHdr = tc.find((c) => c.key === "frequency_count")?.label?.trim() || "Frequency Count";
    const durHdr = tc.find((c) => c.key === "duration_minutes")?.label?.trim() || "Duration (Minutes)";
    const occHdr = tc.find((c) => c.key === "occurrence")?.label?.trim() || "Occurrence (Yes/No)";
    const occLabels = binaryChoiceLabelsFromColumnLabel(occHdr);
    const nonGridCols = durationNonGridTemplateColumns(tc);
    const rows: BackendTemplateRow[] =
      templateDetails.rows?.length > 0
        ? templateDetails.rows
        : Array.from({ length: 8 }).map((_, i) => ({
            id: `tmp-${i}`,
            row_label: sessionRowLabel(i),
            order: i,
          }));

    lines.push(csvRow(["Data sheet", templateDetails.name]));
    const header: string[] = [];
    if (nonGridCols.length === 0) header.push("Session");
    nonGridCols.forEach((c, idx) => header.push(idx === 0 ? "Session" : c.label));
    for (const b of viewBehaviors) {
      if (showFrequency) header.push(`${b.label} ${freqHdr}`.trim());
      if (showDuration) header.push(`${b.label} ${durHdr}`.trim());
      if (showOccurrence) header.push(`${b.label} ${occHdr}`.trim());
    }
    lines.push(csvRow(header));

    rows.forEach((_row, rowIdx) => {
      const trialNum = rowIdx + 1;
      const group = byTrial.get(trialNum) ?? [];
      const extras = durationExtrasFromEntry(group[0]?.custom_values as Record<string, unknown> | undefined);
      const cells: string[] = [];
      if (nonGridCols.length === 0) cells.push(sessionRowLabel(rowIdx));
      nonGridCols.forEach((c, idx) => {
        if (idx === 0) {
          const v = extras[c.key];
          cells.push(
            v ||
              (isDurationTrialColumnKey(c.key) ? sessionRowLabel(rowIdx) : "")
          );
        } else {
          cells.push(extras[c.key] ?? "");
        }
      });
      for (const b of viewBehaviors) {
        const e = group.find((x) => x.behavior === b.id);
        if (showFrequency) cells.push(e?.frequency_count != null ? String(e.frequency_count) : "");
        if (showDuration) cells.push(e?.duration_minutes != null ? String(e.duration_minutes) : "");
        if (showOccurrence) {
          const v = e?.occurrence;
          if (v === true) cells.push(occLabels[0] ?? "Yes");
          else if (v === false) cells.push(occLabels[1] ?? "No");
          else cells.push("");
        }
      }
      lines.push(csvRow(cells));
    });
    return lines.join("\r\n");
  }

  /** Default / legacy other — one row per behavior */
  lines.push(csvRow(["Data sheet", templateDetails.name]));
  lines.push(csvRow(["Behavior", "Occurred", "Measurement", "Value / notes"]));
  const sorted = [...entries].sort((a, b) => (a.trial_number ?? 0) - (b.trial_number ?? 0));
  sorted.forEach((e) => {
    const label =
      (e.custom_values?.behavior_label != null
        ? String(e.custom_values.behavior_label)
        : behaviorIdToName.get(e.behavior)) ?? e.behavior;
    const meas = e.custom_values?.measurement != null ? String(e.custom_values.measurement) : "";
    const val =
      e.frequency_count != null && e.frequency_count > 0
        ? String(e.frequency_count)
        : e.duration_minutes != null
          ? String(e.duration_minutes)
          : e.duration_seconds != null
            ? String(e.duration_seconds)
            : "";
    const note = typeof e.custom_values?.notes === "string" ? e.custom_values.notes : "";
    const combined = [val, note].filter(Boolean).join(" — ");
    lines.push(csvRow([label, yesNo(e.occurrence), meas, combined]));
  });

  return lines.join("\r\n");
}
