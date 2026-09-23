/** Persian digit display helper (presentation only — never used for data). */
export function toFa(n: number | string): string {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  return String(n).replace(/\d/g, (d) => fa[Number(d)]);
}

/**
 * Normalize Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII.
 * Input normalization ONLY (e.g. age typed on a Persian keyboard) —
 * displayed values always go through toFa, never the reverse.
 */
export function normalizeDigits(s: string): string {
  return s.replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (d) => {
    const code = d.charCodeAt(0);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    return String(code - 0x0660);
  });
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return toFa(Math.round(ms).toLocaleString("en-US"));
}

export function formatD(d: number | null | undefined): string {
  if (d === null || d === undefined) return "—";
  return d.toFixed(3).replace("-", "−").replace(/\d/g, (c) => "۰۱۲۳۴۵۶۷۸۹"[Number(c)] ?? c).replace("−", "−");
}
