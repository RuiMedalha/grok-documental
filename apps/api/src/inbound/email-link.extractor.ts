/**
 * Extrai URLs de faturas a partir do corpo de emails (HTML/texto).
 * Cobre padrões comuns: Moloni, TOConline, links genéricos .pdf / download.
 */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** Hosts / paths conhecidos em PT */
const PRIORITY_PATTERNS: RegExp[] = [
  /moloni\.pt/i,
  /moloni\.com/i,
  /toconline\.pt/i,
  /toconline\.com/i,
  /invoicexpress\.com/i,
  /invoiceexpress\.com/i,
  /vendus\.pt/i,
  /fact\.pt/i,
  /invoicecloud/i,
  /download/i,
  /\.pdf(\?|$)/i,
  /fatura/i,
  /invoice/i,
  /documento/i,
];

export function extractUrlsFromEmail(body: string): string[] {
  if (!body) return [];
  // Strip HTML tags lightly but keep hrefs
  const hrefs = [...body.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const plain = body.replace(/<[^>]+>/g, ' ');
  const raw = [...(plain.match(URL_RE) || []), ...hrefs];

  const cleaned = raw
    .map((u) =>
      u
        .replace(/&amp;/g, '&')
        .replace(/[.,;:!?)]+$/g, '')
        .trim(),
    )
    .filter((u) => u.startsWith('http'));

  // Unique preserve order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const u of cleaned) {
    if (seen.has(u)) continue;
    seen.add(u);
    unique.push(u);
  }

  // Rank: priority hosts first
  unique.sort((a, b) => score(b) - score(a));
  return unique;
}

function score(url: string): number {
  let s = 0;
  for (const p of PRIORITY_PATTERNS) {
    if (p.test(url)) s += 10;
  }
  if (/\.pdf(\?|$)/i.test(url)) s += 20;
  return s;
}

/** Escolhe os melhores candidatos a fatura (máx. N) */
export function pickInvoiceLinks(body: string, max = 3): string[] {
  const urls = extractUrlsFromEmail(body);
  const preferred = urls.filter((u) => score(u) >= 10);
  const list = preferred.length ? preferred : urls;
  return list.slice(0, max);
}
