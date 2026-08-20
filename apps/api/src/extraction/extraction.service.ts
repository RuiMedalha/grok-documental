import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { PartyType } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseAtQr, atQrToDocumentFields, isLikelyAtQr } from './at-qr.parser';

export interface ExtractedFields {
  supplier?: string;
  customer?: string;
  nif?: string;
  docNumber?: string;
  docDate?: string; // ISO
  dueDate?: string;
  total?: number;
  iva?: number;
  currency?: string;
  confidence: number;
  rawHints: string[];
}

/**
 * MVP extraction: regex heuristics on text.
 * PDF/image: if plain text available use it; otherwise placeholder for OCR (Tesseract/AWS Textract).
 */
@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  constructor(
    private prisma: PrismaService,
    private parties: PartiesService,
  ) {}

  /** Extract structured fields from free text (OCR output or DOCX text) */
  extractFromText(text: string): ExtractedFields {
    const hints: string[] = [];
    const normalized = text.replace(/\r/g, '\n');

    // Prefer AT QR payload if present in text
    const qrCandidate = normalized.split(/\n/).find((l) => isLikelyAtQr(l)) || (isLikelyAtQr(normalized.replace(/\s/g, '')) ? normalized.replace(/\s/g, '') : null);
    if (qrCandidate) {
      const at = parseAtQr(qrCandidate.replace(/\s/g, ''));
      if (at) {
        const mapped = atQrToDocumentFields(at);
        hints.push('source:at_qr', `atcud:${at.atcud || ''}`);
        return {
          supplier: undefined,
          nif: mapped.nif,
          docNumber: mapped.docNumber,
          docDate: mapped.docDate,
          total: mapped.total,
          iva: mapped.iva,
          currency: 'EUR',
          confidence: 0.95,
          rawHints: hints,
        };
      }
    }


    // Portuguese NIF: 9 digits
    const nifMatch =
      normalized.match(/(?:NIF|N\.?\s*I\.?\s*F\.?|Contribuinte)[:\s]*(\d{9})/i) ||
      normalized.match(/\b([123568]\d{8})\b/);
    const nif = nifMatch?.[1];
    if (nif) hints.push(`nif:${nif}`);

    // Invoice number
    const numMatch =
      normalized.match(
        /(?:Fatura|Factura|FT|Invoice|N[ºo°\.]*\s*(?:Fatura|FT)?)[:\s#]*([A-Z0-9\/\-]+)/i,
      ) || normalized.match(/(?:N[ºo°]\s*)([A-Z]{0,3}\d+[\/\-]\d+)/i);
    const docNumber = numMatch?.[1]?.trim();
    if (docNumber) hints.push(`docNumber:${docNumber}`);

    // Dates DD/MM/YYYY or YYYY-MM-DD
    const dateMatches = [
      ...normalized.matchAll(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/g),
    ];
    let docDate: string | undefined;
    let dueDate: string | undefined;
    if (dateMatches[0]) {
      const [, d, m, y] = dateMatches[0];
      docDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      hints.push(`docDate:${docDate}`);
    }
    const dueLabel = normalized.match(
      /(?:Vencimento|Data\s*limite|Due\s*date)[:\s]*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/i,
    );
    if (dueLabel) {
      dueDate = `${dueLabel[3]}-${dueLabel[2].padStart(2, '0')}-${dueLabel[1].padStart(2, '0')}`;
      hints.push(`dueDate:${dueDate}`);
    }

    // Amounts: total / IVA
    const totalMatch =
      normalized.match(
        /(?:Total\s*(?:a\s*pagar|il[ií]quido|com\s*IVA)?|Total\s*GERAL|Amount\s*due)[:\s]*€?\s*([\d\.,]+)/i,
      ) || normalized.match(/TOTAL[:\s]*€?\s*([\d\.,]+)/i);
    const ivaMatch = normalized.match(
      /(?:IVA|VAT|I\.V\.A\.)[:\s]*€?\s*([\d\.,]+)/i,
    );

    const parsePt = (s?: string) => {
      if (!s) return undefined;
      const cleaned = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : undefined;
    };

    const total = parsePt(totalMatch?.[1]);
    const iva = parsePt(ivaMatch?.[1]);
    if (total != null) hints.push(`total:${total}`);
    if (iva != null) hints.push(`iva:${iva}`);

    // Supplier heuristic: line near NIF or "Exmo" / company pattern
    let supplier: string | undefined;
    const supplierLine = normalized.match(
      /(?:Fornecedor|Emitente|De|From)[:\s]+([^\n]{3,80})/i,
    );
    if (supplierLine) {
      supplier = supplierLine[1].trim().slice(0, 120);
      hints.push(`supplier:${supplier}`);
    }

    let confidence = 0.2;
    if (nif) confidence += 0.25;
    if (total != null) confidence += 0.25;
    if (docNumber) confidence += 0.15;
    if (docDate) confidence += 0.1;
    if (supplier) confidence += 0.05;

    return {
      supplier,
      nif,
      docNumber,
      docDate,
      dueDate,
      total,
      iva,
      currency: 'EUR',
      confidence: Math.min(confidence, 0.95),
      rawHints: hints,
    };
  }

  /** Run extraction on uploaded file and update document + optional party link */
  async applyAtQrPayload(
    tenantId: string,
    userId: string,
    documentId: string,
    qrText: string,
  ) {
    const at = parseAtQr(qrText);
    if (!at) throw new Error('QR Code AT inválido ou não reconhecido');
    const mapped = atQrToDocumentFields(at);

    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) throw new Error('Documento não encontrado');

    let partyId = doc.partyId;
    if (mapped.nif) {
      try {
        const party = await this.parties.matchOrCreate(tenantId, userId, {
          name: `NIF ${mapped.nif}`,
          nif: mapped.nif,
          type: PartyType.supplier,
        });
        if (party) partyId = party.id;
      } catch {
        /* ignore */
      }
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        nif: mapped.nif || doc.nif,
        docNumber: mapped.docNumber || doc.docNumber,
        docDate: mapped.docDate ? new Date(mapped.docDate) : doc.docDate,
        total: mapped.total ?? doc.total,
        iva: mapped.iva ?? doc.iva,
        type: (mapped.type as any) || doc.type,
        partyId,
        status: 'em_revisao',
        metadata: {
          ...((doc.metadata as any) || {}),
          atQr: at,
          extractedAt: new Date().toISOString(),
          source: 'at_qr',
        },
      },
      include: { party: true },
    });

    return { document: updated, atQr: at };
  }

  async processDocument(
    tenantId: string,
    userId: string,
    documentId: string,
  ): Promise<{ document: any; extracted: ExtractedFields }> {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) throw new Error('Documento não encontrado');

    let text = '';
    try {
      const fullPath = path.isAbsolute(doc.fileKey)
        ? doc.fileKey
        : path.join(process.cwd(), 'uploads', doc.fileKey);
      if (doc.mimeType?.includes('text') || doc.fileName.endsWith('.txt')) {
        text = await fs.readFile(fullPath, 'utf8');
      } else if (
        doc.mimeType?.includes('pdf') ||
        doc.mimeType?.startsWith('image/')
      ) {
        // Placeholder: real OCR would call Tesseract / Textract / Google Vision
        // Try reading as utf8 in case it's a text-based PDF export
        try {
          const buf = await fs.readFile(fullPath);
          text = buf.toString('utf8').replace(/[^\x20-\x7E\n\r\tÀ-ÿ€]/g, ' ');
        } catch {
          text = '';
        }
        this.logger.log(
          `OCR placeholder for ${doc.fileName} — integrate Tesseract/Textract for production`,
        );
      }
    } catch (e) {
      this.logger.warn(`Could not read file for extraction: ${e}`);
    }

    // Also use existing metadata fields as weak text
    text = [
      text,
      doc.fileName,
      doc.supplier,
      doc.customer,
      doc.nif,
      doc.docNumber,
    ]
      .filter(Boolean)
      .join('\n');

    const extracted = this.extractFromText(text);

    const data: any = {
      metadata: {
        ...((doc.metadata as any) || {}),
        extraction: extracted,
        extractedAt: new Date().toISOString(),
      },
    };

    if (extracted.supplier && !doc.supplier) data.supplier = extracted.supplier;
    if (extracted.nif && !doc.nif) data.nif = extracted.nif;
    if (extracted.docNumber && !doc.docNumber) data.docNumber = extracted.docNumber;
    if (extracted.total != null && doc.total == null) data.total = extracted.total;
    if (extracted.iva != null && doc.iva == null) data.iva = extracted.iva;
    if (extracted.docDate && !doc.docDate) data.docDate = new Date(extracted.docDate);
    if (extracted.dueDate && !doc.dueDate) data.dueDate = new Date(extracted.dueDate);
    if (extracted.confidence >= 0.4) data.status = 'em_revisao';

    // Link party by NIF/name
    if (extracted.nif || extracted.supplier) {
      try {
        const party = await this.parties.matchOrCreate(tenantId, userId, {
          name: extracted.supplier,
          nif: extracted.nif,
          type:
            doc.type === 'fatura_emitida' ? PartyType.customer : PartyType.supplier,
        });
        if (party && !doc.partyId) data.partyId = party.id;
      } catch (e) {
        this.logger.warn(`Party match failed: ${e}`);
      }
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data,
      include: { party: true },
    });

    return { document: updated, extracted };
  }
}
