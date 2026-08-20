/**
 * CSV export helpers — Excel-compatible (UTF-8 BOM + semicolon for PT locale)
 */

function escapeCsv(value: unknown, sep = ';'): string {
  if (value == null) return '';
  let s = String(value);
  if (s.includes('"') || s.includes(sep) || s.includes('\n') || s.includes('\r')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  sep = ';',
): string {
  const bom = '\uFEFF'; // Excel UTF-8
  const headerLine = headers.map((h) => escapeCsv(h, sep)).join(sep);
  const dataLines = rows.map((row) => row.map((c) => escapeCsv(c, sep)).join(sep));
  return bom + [headerLine, ...dataLines].join('\r\n');
}

export function formatDatePt(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-PT');
}

export function formatNumberPt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '';
  return Number(n).toLocaleString('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
