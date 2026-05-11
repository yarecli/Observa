import type { JSX } from "react";
import React from "react";
import type { CSSProperties } from "react";
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

const card: CSSProperties = { background: "white", border: "1px solid #ccc", padding: 20, marginBottom: 16 };
const inpSheet: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid #ccc",
  fontSize: 13,
  boxSizing: "border-box",
  textAlign: "center",
};

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

const DEFAULT_BINARY_CHOICE_LABELS: [string, string] = ["Yes", "No"];

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

function sheetStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v);
}

function fmtNum(n: unknown): string {
  if (n === null || n === undefined) return "";
  if (typeof n === "number" && Number.isFinite(n)) return String(n);
  return "";
}

export interface SessionEntryView {
  behavior: string;
  time_interval?: string | null;
  frequency_count?: number | null;
  duration_seconds?: number | null;
  duration_minutes?: number | null;
  occurrence?: boolean | null;
  behavior_occurrence_note?: boolean | null;
  trial_number?: number | null;
  row_label?: string | null;
  custom_values?: Record<string, unknown>;
}

export interface SessionViewModel {
  id: string;
  client_id: string;
  date: string;
  session_identifier: string;
  session_number: number | null;
  template: string | null;
  passage_of_time?: string | null;
  minute?: number | null;
  custom_columns?: unknown[];
  selected_behaviors?: string[];
  entries: SessionEntryView[];
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

type ViewBehavior = { id: string; label: string };

function ReadonlyCell({ value, style }: { value: string; style?: CSSProperties }): JSX.Element {
  return (
    <span
      style={{
        display: "block",
        minHeight: 28,
        padding: "6px 4px",
        textAlign: "center",
        fontSize: 13,
        ...style,
      }}
    >
      {value}
    </span>
  );
}

export function ClientDatasheetPreview(props: {
  session: SessionViewModel;
  templateDetails: BackendTemplateDetails | null;
  templateListName: string;
  behaviorIdToName: Map<string, string>;
  clientDisplayName: string;
  dataCollectorName?: string;
}): JSX.Element {
  const { session, templateDetails, templateListName, behaviorIdToName, clientDisplayName, dataCollectorName } =
    props;
  const entries = session.entries ?? [];
  const notes = sessionNotes(entries);
  const passage = (session.passage_of_time ?? "").trim();

  const sheetMode = templateDetails ? getSheetMode(templateDetails) : "legacy";
  const layoutType = templateDetails ? getLayoutType(templateDetails) : "other";

  const templateTitle =
    templateDetails?.name?.trim() ||
    (session.template ? templateListName : "Default") ||
    "Data sheet";

  const dateStr = (() => {
    const d = new Date(session.date);
    if (Number.isNaN(d.getTime())) return session.date;
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  })();

  const behaviorsOrdered = behaviorOrder(session, entries);
  const viewBehaviors: ViewBehavior[] = behaviorsOrdered.map((id) => ({
    id,
    label:
      entries.find((e) => e.behavior === id)?.custom_values?.behavior_label != null
        ? String(entries.find((e) => e.behavior === id)!.custom_values!.behavior_label)
        : behaviorIdToName.get(id) ?? id.slice(0, 8),
  }));

  /** Summary — matches Data Entry “Summary” card (green tint). */
  const summaryBlock = (
    <div style={{ ...card, background: "#f0f9f5", border: "1px solid #c0ddd5" }}>
      <h3 style={{ fontSize: 14, marginBottom: 10 }}>Summary</h3>
      <div style={{ fontSize: 12, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px" }}>
        <span style={{ color: "#666" }}>Client:</span>
        <strong>{clientDisplayName}</strong>
        {dataCollectorName ? (
          <>
            <span style={{ color: "#666" }}>Collected by:</span>
            <strong>{dataCollectorName}</strong>
          </>
        ) : null}
        <span style={{ color: "#666" }}>Session date:</span>
        <strong>{dateStr}</strong>
        <span style={{ color: "#666" }}>Template:</span>
        <strong>{templateTitle}</strong>
        {session.session_number != null && (
          <>
            <span style={{ color: "#666" }}>Session:</span>
            <strong>#{session.session_number}</strong>
          </>
        )}
        {passage ? (
          <>
            <span style={{ color: "#666" }}>Time:</span>
            <strong>{passage}</strong>
          </>
        ) : null}
        {session.minute != null &&
          templateDetails &&
          isDurationFrequencySessionTemplate(templateDetails) && (
            <>
              <span style={{ color: "#666" }}>Minute:</span>
              <strong>{session.minute}</strong>
            </>
          )}
        {sheetMode === "paper_trial" && firstCustomColumn(session.custom_columns)?.behavior_occurred != null && (
          <>
            <span style={{ color: "#666" }}>Occurred:</span>
            <strong>{String(firstCustomColumn(session.custom_columns)!.behavior_occurred)}</strong>
          </>
        )}
        {layoutType === "other" &&
          sheetMode === "legacy" &&
          entries.some((e) => {
            const m = e.custom_values?.measurement;
            return (m != null && String(m).trim() !== "") || e.occurrence === true;
          }) && (
            <>
              <span style={{ color: "#666" }}>Per behavior:</span>
              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {entries
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
                  .join(" · ")}
              </span>
            </>
          )}
        {(sheetMode === "paper_trial" || sheetMode === "paper_dri") &&
          firstCustomColumn(session.custom_columns)?.behaviors != null &&
          Array.isArray(firstCustomColumn(session.custom_columns)!.behaviors) && (
            <>
              <span style={{ color: "#666" }}>Behaviors:</span>
              <strong>
                {(firstCustomColumn(session.custom_columns)!.behaviors as { label: string }[])
                  .map((b) => b.label)
                  .join(", ")}
              </strong>
            </>
          )}
        {sheetMode === "paper_dri" &&
          firstCustomColumn(session.custom_columns)?.target_behavior_definitions != null &&
          Array.isArray(firstCustomColumn(session.custom_columns)!.target_behavior_definitions) && (
            <>
              <span style={{ color: "#666" }}>Behaviors:</span>
              <strong>
                {(firstCustomColumn(session.custom_columns)!.target_behavior_definitions as { label: string }[])
                  .map((b) => b.label)
                  .join(", ")}
              </strong>
            </>
          )}
        {sheetMode === "legacy" && viewBehaviors.length > 0 ? (
          <>
            <span style={{ color: "#666" }}>Behaviors:</span>
            <strong>{viewBehaviors.map((b) => b.label).join(", ")}</strong>
          </>
        ) : null}
        {notes.trim() ? (
          <>
            <span style={{ color: "#666" }}>Session notes:</span>
            <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{notes}</span>
          </>
        ) : null}
      </div>
    </div>
  );

  /** --- Paper trial readonly --- */
  let paperTrialTable: JSX.Element | null = null;
  if (sheetMode === "paper_trial" && templateDetails) {
    const cols = templateDetails.columns ?? [];
    const { trialDisplayKey, ordered: orderedCols } = paperTrialColumnRoles(cols);
    const byTrial = groupEntriesByTrial(entries);
    const rowIndices = [...byTrial.keys()].sort((a, b) => a - b);

    const thStyle: CSSProperties = {
      border: "2px solid #222",
      padding: "10px 12px",
      fontSize: 26,
      fontFamily: "Georgia, serif",
      textAlign: "left",
    };
    const tdBase: CSSProperties = { border: "2px solid #222", padding: 6 };

    paperTrialTable = (
      <div style={{ ...card, padding: 16 }}>
        <div style={{ marginBottom: 10, fontWeight: "bold" }}>{templateDetails.name}</div>
        <div style={{ overflowX: "auto" }}>
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
              {rowIndices.map((trialNum, rowIdx) => {
                const group = byTrial.get(trialNum) ?? [];
                const src = (group[0]?.custom_values ?? {}) as Record<string, unknown>;
                return (
                  <tr key={`pt-${trialNum}`}>
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
                          </td>
                        );
                      }
                      const raw = src[col.key];
                      return (
                        <td key={col.key} style={tdBase}>
                          <ReadonlyCell value={sheetStr(raw)} style={{ fontSize: 16, fontFamily: "Georgia, serif" }} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /** --- Paper DRI readonly --- */
  let paperDriTable: JSX.Element | null = null;
  if (sheetMode === "paper_dri" && templateDetails) {
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
    const byTrial = groupEntriesByTrial(entries);
    const rowIndices = [...byTrial.keys()].sort((a, b) => a - b);

    const thBase: CSSProperties = {
      border: "1px solid #444",
      padding: "6px 8px",
      background: "#fff",
      fontSize: 12,
      fontWeight: "bold",
    };
    const tdBase: CSSProperties = { border: "1px solid #444", padding: 4, background: "#fff" };

    if (dynamic && driTargets.length > 0) {
      const timeLabel = templateDetails.columns.find((c) => c.key === timeKey)?.label ?? "Time";
      const latencyLabel = templateDetails.columns.find((c) => c.key === latencyKey)?.label ?? "Latency";
      const minW = Math.max(700, 120 + 220 + driTargets.length * 130);
      paperDriTable = (
        <div style={{ ...card, padding: 16 }}>
          <div style={{ marginBottom: 10, fontWeight: "bold" }}>{templateDetails.name}</div>
          <div style={{ overflowX: "auto" }}>
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
                {rowIndices.map((trialNum, rowIdx) => {
                  const group = byTrial.get(trialNum) ?? [];
                  const ordered = behaviorOrder(session, group)
                    .map((bid) => group.find((e) => e.behavior === bid))
                    .filter(Boolean) as SessionEntryView[];
                  const first = ordered[0];
                  const timeVal =
                    sheetStr(first?.custom_values?.[timeKey]) ||
                    (first?.row_label != null ? String(first.row_label) : "") ||
                    (first?.time_interval != null ? String(first.time_interval) : "");
                  const latRaw = first?.custom_values?.[latencyKey];
                  const latStr = latRaw !== undefined && latRaw !== null ? sheetStr(latRaw) : "";
                  return (
                    <tr key={`dri-${trialNum}`}>
                      <td style={{ ...tdBase, minWidth: 120 }}>
                        <ReadonlyCell value={timeVal || sessionRowLabel(rowIdx)} />
                      </td>
                      <td style={{ ...tdBase, minWidth: 220, background: "#e9e9e9" }}>
                        <ReadonlyCell value={latStr} />
                      </td>
                      {freqKeys.map((fk, fi) => {
                        const e = ordered[fi];
                        return (
                          <td key={fk} style={{ ...tdBase, minWidth: 130 }}>
                            <ReadonlyCell value={fmtNum(e?.frequency_count)} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    /** System DRI (non-dynamic): Time | Bx1 freq | Latency | Bx2 | Bx3 */
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
        cols.find((c) => c.key === "chewy_frequency") ??
        col(cols, "behavior 2 frequency", "behavior_2_frequency") ??
        cols[3];
      const sib3Col =
        cols.find((c) => c.key === "behavior_3_frequency") ??
        cols.find((c) => c.key === "sib3_frequency") ??
        cols.find((c) => c.key === "mouthing_frequency") ??
        col(cols, "behavior 3 frequency", "behavior_3_frequency") ??
        cols[4];

      paperDriTable = (
        <div style={{ ...card, padding: 16 }}>
          <div style={{ marginBottom: 10, fontWeight: "bold" }}>{templateDetails.name}</div>
          <div style={{ overflowX: "auto" }}>
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
                {rowIndices.map((trialNum, rowIdx) => {
                  const group = byTrial.get(trialNum) ?? [];
                  const ordered = behaviorOrder(session, group)
                    .map((bid) => group.find((e) => e.behavior === bid))
                    .filter(Boolean) as SessionEntryView[];
                  const e0 = ordered[0];
                  const e1 = ordered[1];
                  const e2 = ordered[2];
                  const tk = timeCol?.key ?? "time";
                  const timeVal =
                    sheetStr(e0?.custom_values?.[tk]) ||
                    (e0?.row_label != null ? String(e0.row_label) : "") ||
                    (e0?.time_interval != null ? String(e0.time_interval) : "");
                  const lk = latencyCol?.key ?? "latency_from_snacktime";
                  const latRaw = e0?.custom_values?.[lk];
                  return (
                    <tr key={`dri-s-${trialNum}`}>
                      <td style={{ ...tdBase, minWidth: 120 }}>
                        <ReadonlyCell value={timeVal || sessionRowLabel(rowIdx)} />
                      </td>
                      <td style={{ ...tdBase, minWidth: 120 }}>
                        <ReadonlyCell value={fmtNum(e0?.frequency_count)} />
                      </td>
                      <td style={{ ...tdBase, minWidth: 220, background: "#e9e9e9" }}>
                        <ReadonlyCell value={latRaw !== undefined && latRaw !== null ? sheetStr(latRaw) : ""} />
                      </td>
                      <td style={{ ...tdBase, minWidth: 140 }}>
                        <ReadonlyCell value={fmtNum(e1?.frequency_count)} />
                      </td>
                      <td style={{ ...tdBase, minWidth: 160 }}>
                        <ReadonlyCell value={fmtNum(e2?.frequency_count)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
  }

  /** --- Legacy interval --- */
  let intervalTable: JSX.Element | null = null;
  if (sheetMode === "legacy" && layoutType === "interval" && templateDetails) {
    const tc = templateDetails.columns ?? [];
    const showFrequency = tc.some((c) => c.key === "frequency_count");
    const showDuration = tc.some((c) => c.key === "duration_seconds");
    const showBehaviorOcc = tc.some((c) => c.key === "behavior_occurrence_note");
    const freqHdr = tc.find((c) => c.key === "frequency_count")?.label?.trim() || "Frequency Count";
    const durHdr = tc.find((c) => c.key === "duration_seconds")?.label?.trim() || "Duration (seconds)";
    const behOccHdr = tc.find((c) => c.key === "behavior_occurrence_note")?.label?.trim() || "Occurrence (Yes/No)";
    const occLabels = binaryChoiceLabelsFromColumnLabel(behOccHdr);
    const rows: BackendTemplateRow[] =
      templateDetails.rows?.length > 0
        ? templateDetails.rows
        : Array.from({ length: 10 }).map((_, i) => ({
            id: `tmp-${i}`,
            row_label: sessionRowLabel(i),
            order: i,
          }));
    const byTrial = groupEntriesByTrial(entries);

    intervalTable = (
      <div style={{ ...card, padding: 16 }}>
        <div style={{ marginBottom: 10, fontWeight: "bold" }}>{templateDetails.name}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 800 }}>
            <thead>
              <tr>
                <th
                  style={{
                    border: "1px solid #ccc",
                    padding: "6px 8px",
                    background: "#fafafa",
                    position: "sticky",
                    left: 0,
                    zIndex: 2,
                  }}
                >
                  Session
                </th>
                {viewBehaviors.map((b) => (
                  <React.Fragment key={`h-${b.id}`}>
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
              {rows.map((row, rowIdx) => {
                const trialNum = rowIdx + 1;
                const group = byTrial.get(trialNum) ?? [];
                return (
                  <tr key={row.id}>
                    <td
                      style={{
                        border: "1px solid #ccc",
                        padding: "6px 8px",
                        background: "#fff",
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                      }}
                    >
                      {sessionRowLabel(rowIdx)}
                    </td>
                    {viewBehaviors.map((b) => {
                      const e = group.find((x) => x.behavior === b.id);
                      return (
                        <React.Fragment key={`c-${row.id}-${b.id}`}>
                          {showFrequency && (
                            <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 90 }}>
                              <ReadonlyCell value={fmtNum(e?.frequency_count)} style={inpSheet} />
                            </td>
                          )}
                          {showDuration && (
                            <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 110 }}>
                              <ReadonlyCell value={fmtNum(e?.duration_seconds)} style={inpSheet} />
                            </td>
                          )}
                          {showBehaviorOcc && (
                            <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 120 }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                {occLabels.map((opt, oi) => {
                                  const truthy = oi === 0;
                                  const active = e?.behavior_occurrence_note === truthy;
                                  return (
                                    <span
                                      key={opt}
                                      style={{
                                        flex: 1,
                                        textAlign: "center",
                                        padding: "6px 8px",
                                        fontSize: 12,
                                        border: "1px solid #ccc",
                                        borderRadius: 4,
                                        background: active ? "#4a7c6f" : "#f9f9f9",
                                        color: active ? "white" : "#333",
                                      }}
                                    >
                                      {opt}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /** --- Legacy duration --- */
  let durationTable: JSX.Element | null = null;
  if (sheetMode === "legacy" && layoutType === "duration" && templateDetails) {
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
    const byTrial = groupEntriesByTrial(entries);
    const thNorm: CSSProperties = { border: "1px solid #ccc", padding: "6px 8px", background: "#fafafa" };
    const minW = Math.max(800, 160 + nonGridCols.length * 110 + viewBehaviors.length * 200);

    durationTable = (
      <div style={{ ...card, padding: 16 }}>
        <div style={{ marginBottom: 10, fontWeight: "bold" }}>{templateDetails.name}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: minW }}>
            <thead>
              <tr>
                {nonGridCols.length === 0 && (
                  <th
                    style={{
                      border: "1px solid #ccc",
                      padding: "6px 8px",
                      background: "#fafafa",
                      position: "sticky",
                      left: 0,
                      zIndex: 2,
                    }}
                  >
                    Session
                  </th>
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
                {viewBehaviors.map((b) => (
                  <React.Fragment key={`dh-${b.id}`}>
                    {showFrequency && (
                      <th style={thNorm}>{`${b.label} ${freqHdr}`.trim()}</th>
                    )}
                    {showDuration && <th style={thNorm}>{`${b.label} ${durHdr}`.trim()}</th>}
                    {showOccurrence && <th style={thNorm}>{`${b.label} ${occHdr}`.trim()}</th>}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => {
                const trialNum = rowIdx + 1;
                const group = byTrial.get(trialNum) ?? [];
                const extras = durationExtrasFromEntry(group[0]?.custom_values as Record<string, unknown> | undefined);
                return (
                  <tr key={row.id}>
                    {nonGridCols.length === 0 && (
                      <td
                        style={{
                          border: "1px solid #ccc",
                          padding: "6px 8px",
                          background: "#fff",
                          position: "sticky",
                          left: 0,
                          zIndex: 1,
                        }}
                      >
                        {sessionRowLabel(rowIdx)}
                      </td>
                    )}
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
                        <ReadonlyCell
                          value={
                            idx === 0
                              ? sheetStr(extras[c.key]) ||
                                (isDurationTrialColumnKey(c.key) ? sessionRowLabel(rowIdx) : "")
                              : sheetStr(extras[c.key])
                          }
                          style={inpSheet}
                        />
                      </td>
                    ))}
                    {viewBehaviors.map((b) => {
                      const e = group.find((x) => x.behavior === b.id);
                      return (
                        <React.Fragment key={`dc-${row.id}-${b.id}`}>
                          {showFrequency && (
                            <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 90 }}>
                              <ReadonlyCell value={fmtNum(e?.frequency_count)} style={inpSheet} />
                            </td>
                          )}
                          {showDuration && (
                            <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 110 }}>
                              <ReadonlyCell value={fmtNum(e?.duration_minutes)} style={inpSheet} />
                            </td>
                          )}
                          {showOccurrence && (
                            <td style={{ border: "1px solid #ccc", padding: 4, minWidth: 120 }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                {occLabels.map((opt, oi) => {
                                  const truthy = oi === 0;
                                  const active = e?.occurrence === truthy;
                                  return (
                                    <span
                                      key={opt}
                                      style={{
                                        flex: 1,
                                        textAlign: "center",
                                        padding: "6px 8px",
                                        fontSize: 12,
                                        border: "1px solid #ccc",
                                        borderRadius: 4,
                                        background: active ? "#4a7c6f" : "#f9f9f9",
                                        color: active ? "white" : "#333",
                                      }}
                                    >
                                      {opt}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /** Maladaptive / unknown legacy: compact list */
  let fallbackLegacy: JSX.Element | null = null;
  if (
    sheetMode === "legacy" &&
    layoutType === "other" &&
    templateDetails &&
    templateDetails.name === "Maladaptive Behavior Data Sheet"
  ) {
    fallbackLegacy = (
      <div style={{ ...card, padding: 16 }}>
        <div style={{ marginBottom: 10, fontWeight: "bold" }}>{templateDetails.name}</div>
        <p style={{ fontSize: 13, color: "#666" }}>This archived template stores rows in a legacy shape. Showing raw entries.</p>
        <div style={{ fontSize: 13 }}>
          {entries.map((e, i) => (
            <div key={i} style={{ padding: 8, borderBottom: "1px solid #eee" }}>
              <strong>{behaviorIdToName.get(e.behavior) ?? e.behavior}</strong>
              {e.custom_values && (
                <pre style={{ fontSize: 12, margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(e.custom_values, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {summaryBlock}
      {paperTrialTable}
      {paperDriTable}
      {intervalTable}
      {durationTable}
      {fallbackLegacy}
    </div>
  );
}


