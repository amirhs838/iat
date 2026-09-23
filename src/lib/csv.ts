// =============================================================================
// CSV serialization (Excel-compatible: UTF-8 BOM + RFC4180 quoting).
// =============================================================================

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  // UTF-8 BOM so Excel renders Persian text correctly
  return "\uFEFF" + lines.join("\r\n");
}
