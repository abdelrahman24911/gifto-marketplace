/**
 * Minimal RFC 4180 CSV serialisation for dashboard exports (finance ledgers).
 * Amounts are exported as decimal EGP strings (e.g. "123.45") so a
 * spreadsheet opens them as numbers without a currency symbol to strip.
 */

export function csvCell(
  value: string | number | null | undefined,
): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = [headers, ...rows].map((row) =>
    row.map(csvCell).join(","),
  );
  return `${lines.join("\r\n")}\r\n`;
}

/** Minor units (piastres) to a decimal EGP string with two places. */
export function egpDecimal(minor: number): string {
  return (minor / 100).toFixed(2);
}
