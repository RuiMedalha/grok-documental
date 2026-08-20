/**
 * Parser do QR Code de faturas portuguesas (especificações AT).
 * Formato: campos "CODIGO:valor" separados por '*'
 * Ex.: A:123456789*B:500000000*D:FT*F:20260315*G:FT 2026/1*H:J66S9FDD-1*O:123.00*...
 *
 * Referência: Especificações Técnicas Código QR (AT).
 */

export interface AtQrParsed {
  raw: string;
  fields: Record<string, string>;
  issuerNif?: string;
  buyerNif?: string;
  buyerCountry?: string;
  documentType?: string;
  documentStatus?: string;
  documentDate?: string; // YYYY-MM-DD
  uniqueDocId?: string;
  atcud?: string;
  total?: number;
  totalTax?: number;
  hash4?: string;
  softwareCert?: string;
  ivaBreakdown?: { region?: string; baseExempt?: number; baseReduced?: number; taxReduced?: number; baseIntermediate?: number; taxIntermediate?: number; baseNormal?: number; taxNormal?: number }[];
}

const DOC_TYPE_MAP: Record<string, string> = {
  FT: 'fatura_recebida',
  FR: 'fatura_recebida',
  FS: 'fatura_recebida',
  NC: 'outro',
  ND: 'outro',
  RC: 'recibo',
  RG: 'recibo',
};

function parseMoney(v?: string): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function parseDateAt(v?: string): string | undefined {
  // YYYYMMDD
  if (!v || !/^\d{8}$/.test(v)) return undefined;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

export function isLikelyAtQr(text: string): boolean {
  if (!text || text.length < 10) return false;
  // Typical AT payload has A: and at least one more field with *
  return /(?:^|\*)A:\d{9}/.test(text) || (text.includes('A:') && text.includes('*'));
}

export function parseAtQr(raw: string): AtQrParsed | null {
  if (!raw?.trim()) return null;
  const text = raw.trim();
  if (!isLikelyAtQr(text) && !text.includes(':')) {
    // still try generic key:value*
  }

  const fields: Record<string, string> = {};
  for (const part of text.split('*')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const code = part.slice(0, idx).trim().toUpperCase();
    const value = part.slice(idx + 1).trim();
    if (code) fields[code] = value;
  }

  if (!fields['A'] && !fields['O'] && !fields['H']) {
    return null;
  }

  const regions: AtQrParsed['ivaBreakdown'] = [];
  for (const prefix of ['I', 'J', 'K'] as const) {
    if (!fields[`${prefix}1`] && !fields[`${prefix}7`] && !fields[`${prefix}2`]) continue;
    regions.push({
      region: fields[`${prefix}1`],
      baseExempt: parseMoney(fields[`${prefix}2`]),
      baseReduced: parseMoney(fields[`${prefix}3`]),
      taxReduced: parseMoney(fields[`${prefix}4`]),
      baseIntermediate: parseMoney(fields[`${prefix}5`]),
      taxIntermediate: parseMoney(fields[`${prefix}6`]),
      baseNormal: parseMoney(fields[`${prefix}7`]),
      taxNormal: parseMoney(fields[`${prefix}8`]),
    });
  }

  const taxFromRegions = regions.reduce((s, r) => {
    return (
      s +
      (r.taxReduced || 0) +
      (r.taxIntermediate || 0) +
      (r.taxNormal || 0)
    );
  }, 0);

  return {
    raw: text,
    fields,
    issuerNif: fields['A'],
    buyerNif: fields['B'] && fields['B'] !== '0' ? fields['B'] : undefined,
    buyerCountry: fields['C'],
    documentType: fields['D'],
    documentStatus: fields['E'],
    documentDate: parseDateAt(fields['F']),
    uniqueDocId: fields['G'],
    atcud: fields['H'],
    total: parseMoney(fields['O']),
    totalTax: parseMoney(fields['N']) ?? (taxFromRegions || undefined),
    hash4: fields['Q'],
    softwareCert: fields['R'],
    ivaBreakdown: regions.length ? regions : undefined,
  };
}

export function atQrToDocumentFields(parsed: AtQrParsed) {
  const mappedType = parsed.documentType
    ? DOC_TYPE_MAP[parsed.documentType.toUpperCase()] || 'fatura_recebida'
    : 'fatura_recebida';

  return {
    nif: parsed.issuerNif,
    // For received invoices, issuer is supplier
    supplierNif: parsed.issuerNif,
    customerNif: parsed.buyerNif,
    docNumber: parsed.uniqueDocId || parsed.atcud,
    atcud: parsed.atcud,
    docDate: parsed.documentDate,
    total: parsed.total,
    iva: parsed.totalTax,
    type: mappedType,
    currency: 'EUR',
  };
}
