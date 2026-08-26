import * as fs from 'fs/promises';

export type AiProvider = 'gemini' | 'openrouter' | 'openai_compat' | 'none';

export interface AiExtracted {
  supplier?: string;
  customer?: string;
  nif?: string;
  docNumber?: string;
  docDate?: string;
  dueDate?: string;
  total?: number;
  iva?: number;
  currency?: string;
  type?: string;
  notes?: string;
  rawText?: string;
  atQrRaw?: string;
  confidence: number;
  provider: string;
}

function guessMime(fileName?: string, mime?: string) {
  if (mime && mime !== 'application/octet-stream') return mime;
  const l = (fileName || '').toLowerCase();
  if (l.endsWith('.pdf')) return 'application/pdf';
  if (l.endsWith('.png')) return 'image/png';
  if (l.endsWith('.jpg') || l.endsWith('.jpeg')) return 'image/jpeg';
  if (l.endsWith('.webp')) return 'image/webp';
  return mime || 'application/pdf';
}

export function detectAiProvider(): AiProvider {
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.AI_BASE_URL && (process.env.AI_API_KEY || process.env.OPENAI_API_KEY)) {
    return 'openai_compat';
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'gemini';
  return 'none';
}

export function aiConfigured() {
  return detectAiProvider() !== 'none';
}

const PROMPT = `És um contabilista português. Analisa o documento (fatura/recibo/nota).
Se existir QR Code da AT (payload A:...*B:...), inclui o texto cru em atQrRaw.
Devolve APENAS JSON válido:
{
  "supplier": string|null,
  "customer": string|null,
  "nif": string|null,
  "docNumber": string|null,
  "docDate": "YYYY-MM-DD"|null,
  "dueDate": "YYYY-MM-DD"|null,
  "total": number|null,
  "iva": number|null,
  "currency": "EUR",
  "type": "fatura_recebida"|"fatura_emitida"|"recibo"|"comprovativo"|"encomenda"|"outro",
  "notes": string|null,
  "rawText": string,
  "atQrRaw": string|null,
  "confidence": number
}
IMPORTANTE: supplier e customer devem ser STRINGS (nome), nunca objetos.
type deve ser exactamente um dos valores listados (ex: fatura_recebida).`;

function parseJsonPayload(text: string): any {
  const cleaned = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

function asName(v: any): string | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v === 'string') return v.trim().slice(0, 200) || undefined;
  if (typeof v === 'object') {
    const n = v.name || v.nome || v.businessName || v.razaoSocial;
    return n ? String(n).trim().slice(0, 200) : undefined;
  }
  return String(v).trim().slice(0, 200) || undefined;
}

function mapDocType(v: any): string | undefined {
  if (!v) return undefined;
  const s = String(v).toLowerCase();
  const allowed = new Set(['fatura_recebida','fatura_emitida','recibo','comprovativo','encomenda','outro']);
  if (allowed.has(String(v))) return String(v);
  if (s.includes('emitida') || s.includes('venda')) return 'fatura_emitida';
  if (s.includes('recibo')) return 'recibo';
  if (s.includes('comprov')) return 'comprovativo';
  if (s.includes('encomenda')) return 'encomenda';
  if (s.includes('fatura') || s.includes('factura') || s.includes('invoice') || s === 'ft') return 'fatura_recebida';
  return 'fatura_recebida';
}

function toExtracted(parsed: any, provider: string): AiExtracted {
  const num = (v: any) => {
    if (v == null || v === '') return undefined;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };
  const supplierObj = parsed.supplier && typeof parsed.supplier === 'object' ? parsed.supplier : null;
  const nifFromSupplier = supplierObj?.nif ? String(supplierObj.nif).replace(/\s/g, '') : undefined;
  return {
    supplier: asName(parsed.supplier),
    customer: asName(parsed.customer),
    nif: (parsed.nif ? String(parsed.nif).replace(/\s/g, '') : undefined) || nifFromSupplier,
    docNumber: parsed.docNumber || undefined,
    docDate: parsed.docDate || undefined,
    dueDate: parsed.dueDate || undefined,
    total: num(parsed.total),
    iva: num(parsed.iva),
    currency: parsed.currency || 'EUR',
    type: mapDocType(parsed.type),
    notes: parsed.notes || undefined,
    rawText: parsed.rawText || undefined,
    atQrRaw: parsed.atQrRaw || undefined,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
    provider,
  };
}

async function callGemini(b64: string, mime: string, extraHint: string): Promise<AiExtracted> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY!;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: extraHint + '\n' + PROMPT }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Gemini HTTP ${res.status}`);
  const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('\n') || '';
  return toExtracted(parseJsonPayload(text), `gemini:${model}`);
}

async function callOpenAiCompat(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  b64: string;
  mime: string;
  extraHint: string;
  headers?: Record<string, string>;
}): Promise<AiExtracted> {
  const url = opts.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
      ...opts.headers,
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: opts.extraHint + '\n' + PROMPT },
          { type: 'image_url', image_url: { url: `data:${opts.mime};base64,${opts.b64}` } },
        ],
      }],
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || json?.error || `AI HTTP ${res.status}`);
  const text = json?.choices?.[0]?.message?.content || '';
  return toExtracted(parseJsonPayload(text), opts.model);
}

export async function extractWithAi(opts: {
  filePath: string;
  mimeType?: string;
  fileName?: string;
  knownFields?: Record<string, unknown>;
}): Promise<AiExtracted | null> {
  const provider = detectAiProvider();
  if (provider === 'none') return null;
  const buf = await fs.readFile(opts.filePath);
  if (buf.length > 12 * 1024 * 1024) throw new Error('Ficheiro demasiado grande para Vision (max 12MB)');
  const b64 = buf.toString('base64');
  const mime = guessMime(opts.fileName, opts.mimeType);
  const extraHint = opts.knownFields
    ? `Campos já extraídos (QR AT), completa o resto: ${JSON.stringify(opts.knownFields)}`
    : '';
  if (provider === 'gemini') return callGemini(b64, mime, extraHint);
  if (provider === 'openrouter') {
    return callOpenAiCompat({
      baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY!,
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash',
      b64, mime, extraHint,
      headers: {
        'HTTP-Referer': process.env.PUBLIC_API_URL || 'https://docflow.local',
        'X-Title': 'DocFlow',
      },
    });
  }
  return callOpenAiCompat({
    baseUrl: process.env.AI_BASE_URL!,
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY!,
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    b64, mime, extraHint,
  });
}
