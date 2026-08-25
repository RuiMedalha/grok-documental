import * as fs from 'fs/promises';

export interface GeminiExtracted {
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
  confidence: number;
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

export function geminiConfigured() {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export async function extractWithGemini(opts: {
  filePath: string;
  mimeType?: string;
  fileName?: string;
}): Promise<GeminiExtracted | null> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const buf = await fs.readFile(opts.filePath);
  if (buf.length > 12 * 1024 * 1024) {
    throw new Error('Ficheiro demasiado grande para Gemini Vision (max 12MB)');
  }
  const b64 = buf.toString('base64');
  const mime = guessMime(opts.fileName, opts.mimeType);

  const prompt = `És um contabilista português. Analisa este documento fiscal (fatura/recibo/nota).
Devolve APENAS JSON válido, sem markdown, com:
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
  "confidence": number
}
Regras: NIF PT 9 dígitos; datas YYYY-MM-DD; totais com ponto decimal; confidence 0-1.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mime, data: b64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || `Gemini HTTP ${res.status}`);
  }

  const text =
    json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('\n') || '';
  const cleaned = String(text)
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  const parsed = JSON.parse(cleaned);

  const num = (v: any) => {
    if (v == null || v === '') return undefined;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    supplier: parsed.supplier || undefined,
    customer: parsed.customer || undefined,
    nif: parsed.nif ? String(parsed.nif).replace(/\s/g, '') : undefined,
    docNumber: parsed.docNumber || undefined,
    docDate: parsed.docDate || undefined,
    dueDate: parsed.dueDate || undefined,
    total: num(parsed.total),
    iva: num(parsed.iva),
    currency: parsed.currency || 'EUR',
    type: parsed.type || undefined,
    notes: parsed.notes || undefined,
    rawText: parsed.rawText || cleaned,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
  };
}
