/**
 * Simple CSV parser + normalizer for Portuguese bank exports.
 * Handles common separators (; or ,) and decimal formats.
 */

export interface ParsedRow {
  date: Date;
  description: string;
  amount: number;
  balance?: number;
  reference?: string;
  raw: Record<string, string>;
}

export interface ParseOptions {
  mapping: {
    date: string;
    description: string;
    amount?: string;
    debit?: string;
    credit?: string;
    balance?: string;
    reference?: string;
  };
  dateFormat?: string; // DD/MM/YYYY | YYYY-MM-DD | DD-MM-YYYY
  decimalSep?: string; // , or .
  thousandSep?: string;
  hasHeader?: boolean;
}

function detectDelimiter(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ';' : ',';
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseDate(value: string, format = 'DD/MM/YYYY'): Date | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/\s+/g, '');
  let day: number, month: number, year: number;

  if (format === 'YYYY-MM-DD' || /^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
    const [y, m, d] = cleaned.split(/[-/]/).map(Number);
    year = y;
    month = m;
    day = d;
  } else if (format === 'DD-MM-YYYY' || format === 'DD/MM/YYYY') {
    const parts = cleaned.split(/[-/.]/);
    if (parts.length < 3) return null;
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
  } else {
    // fallback try Date.parse
    const d = new Date(cleaned);
    return isNaN(d.getTime()) ? null : d;
  }

  if (!day || !month || !year) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null;
  }
  return d;
}

export function parseAmount(
  value: string,
  decimalSep = ',',
  thousandSep = '.',
): number | null {
  if (value == null || value === '') return null;
  let s = String(value).trim().replace(/\s/g, '');
  // Handle European format: 1.234,56 → 1234.56
  if (decimalSep === ',') {
    s = s.replace(new RegExp(`\\${thousandSep}`, 'g'), '').replace(',', '.');
  } else {
    s = s.replace(new RegExp(`\\${thousandSep}`, 'g'), '');
  }
  // Remove currency symbols
  s = s.replace(/[€$£]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function parseCsvContent(
  content: string,
  options: ParseOptions,
): { headers: string[]; rows: ParsedRow[]; errors: string[] } {
  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], errors: ['Ficheiro vazio'] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const hasHeader = options.hasHeader !== false;
  const headerLine = hasHeader ? lines[0] : null;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const headers = headerLine
    ? parseCsvLine(headerLine, delimiter)
    : parseCsvLine(lines[0], delimiter).map((_, i) => `Col${i + 1}`);

  const colIndex = (name: string) => {
    const idx = headers.findIndex(
      (h) => h.toLowerCase().trim() === name.toLowerCase().trim(),
    );
    return idx >= 0 ? idx : -1;
  };

  const m = options.mapping;
  const dateIdx = colIndex(m.date);
  const descIdx = colIndex(m.description);
  const amountIdx = m.amount ? colIndex(m.amount) : -1;
  const debitIdx = m.debit ? colIndex(m.debit) : -1;
  const creditIdx = m.credit ? colIndex(m.credit) : -1;
  const balanceIdx = m.balance ? colIndex(m.balance) : -1;
  const refIdx = m.reference ? colIndex(m.reference) : -1;

  const errors: string[] = [];
  if (dateIdx < 0) errors.push(`Coluna de data "${m.date}" não encontrada`);
  if (descIdx < 0) errors.push(`Coluna de descrição "${m.description}" não encontrada`);
  if (amountIdx < 0 && debitIdx < 0 && creditIdx < 0) {
    errors.push('É necessário mapear amount OU debit+credit');
  }

  if (errors.length) {
    return { headers, rows: [], errors };
  }

  const rows: ParsedRow[] = [];
  dataLines.forEach((line, i) => {
    const cols = parseCsvLine(line, delimiter);
    const raw: Record<string, string> = {};
    headers.forEach((h, hi) => {
      raw[h] = cols[hi] ?? '';
    });

    const date = parseDate(cols[dateIdx] || '', options.dateFormat || 'DD/MM/YYYY');
    if (!date) {
      errors.push(`Linha ${i + 2}: data inválida "${cols[dateIdx]}"`);
      return;
    }

    let amount: number | null = null;
    if (amountIdx >= 0) {
      amount = parseAmount(cols[amountIdx] || '', options.decimalSep, options.thousandSep);
    } else {
      const debit = parseAmount(cols[debitIdx] || '0', options.decimalSep, options.thousandSep) || 0;
      const credit = parseAmount(cols[creditIdx] || '0', options.decimalSep, options.thousandSep) || 0;
      // Portuguese convention: debit = negative outflow, credit = positive inflow
      amount = credit - debit;
    }

    if (amount == null) {
      errors.push(`Linha ${i + 2}: valor inválido`);
      return;
    }

    const balance =
      balanceIdx >= 0
        ? parseAmount(cols[balanceIdx] || '', options.decimalSep, options.thousandSep) ?? undefined
        : undefined;

    const reference = refIdx >= 0 ? (cols[refIdx] || undefined) : undefined;

    rows.push({
      date,
      description: cols[descIdx] || '',
      amount,
      balance,
      reference,
      raw,
    });
  });

  return { headers, rows, errors };
}

export function computeFileHash(content: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}
