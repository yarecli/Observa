/**
 * Turns a typical DRF JSON error body into a single user-facing string.
 */
export function parseDrfError(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const e = body as Record<string, unknown>;

  if (typeof e.detail === "string" && e.detail.trim()) return e.detail;
  if (Array.isArray(e.detail) && e.detail.length) return String(e.detail[0]);

  if (Array.isArray(e.non_field_errors) && e.non_field_errors.length) {
    return String(e.non_field_errors[0]);
  }

  const parts: string[] = [];
  for (const [key, val] of Object.entries(e)) {
    if (key === "detail" || key === "non_field_errors") continue;
    if (Array.isArray(val) && val.length) parts.push(`${key}: ${val[0]}`);
    else if (typeof val === "string" && val.trim()) parts.push(`${key}: ${val}`);
  }
  return parts.length ? parts.join(" ") : "";
}
