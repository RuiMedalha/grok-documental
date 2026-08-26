import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { PartyType } from '@prisma/client';
import * as path from 'path';
import { parseAtQr, atQrToDocumentFields, isLikelyAtQr } from './at-qr.parser';
import { extractTextFromFile } from './ocr.util';
import { extractWithAi, aiConfigured } from './ai.vision';

export interface ExtractedFields {
  supplier?: string;
  nif?: string;
  docNumber?: string;
  docDate?: string;
  dueDate?: string;
  total?: number;
  iva?: number;
  currency?: string;
  confidence: number;
  rawHints: string[];
}

function supplierName(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'string') return v.trim().slice(0, 200) || undefined;
  if (typeof v === 'object' && v.name) return String(v.name).trim().slice(0, 200);
  return undefined;
}

function mapType(v: any): string {
  if (!v) return 'fatura_recebida';
  const s = String(v).toLowerCase();
  const allowed = ['fatura_recebida','fatura_emitida','recibo','comprovativo','encomenda','outro'];
  if (allowed.includes(s)) return s;
  if (s.includes('recibo')) return 'recibo';
  if (s.includes('emitida')) return 'fatura_emitida';
  if (s.includes('fatura') || s.includes('factura') || s === 'ft') return 'fatura_recebida';
  return 'fatura_recebida';
}

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  constructor(private prisma: PrismaService, private parties: PartiesService) {}

  extractFromText(text: string): ExtractedFields {
    const normalized = text.replace(/\r/g, '\n');
    const qrCandidate =
      normalized.split(/\n/).find((l) => isLikelyAtQr(l)) ||
      (isLikelyAtQr(normalized.replace(/\s/g, '')) ? normalized.replace(/\s/g, '') : null);
    if (qrCandidate) {
      const at = parseAtQr(qrCandidate.replace(/\s/g, ''));
      if (at) {
        const mapped = atQrToDocumentFields(at);
        return {
          nif: mapped.nif,
          docNumber: mapped.docNumber,
          docDate: mapped.docDate,
          total: mapped.total,
          iva: mapped.iva,
          currency: 'EUR',
          confidence: 0.95,
          rawHints: ['source:at_qr'],
        };
      }
    }
    const nifMatch =
      normalized.match(/(?:NIF|Contribuinte)[:\s]*(\d{9})/i) ||
      normalized.match(/\b([123568]\d{8})\b/);
    const totalMatch = normalized.match(/(?:Total\s*(?:a\s*pagar)?|TOTAL)[:\s]*\u20ac?\s*([\d\.,]+)/i);
    const parsePt = (s?: string) => {
      if (!s) return undefined;
      const n = parseFloat(s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    };
    const nif = nifMatch?.[1];
    const total = parsePt(totalMatch?.[1]);
    return {
      nif,
      total,
      currency: 'EUR',
      confidence: nif && total != null ? 0.7 : 0.3,
      rawHints: [],
    };
  }

  async applyAtQrPayload(tenantId: string, userId: string, documentId: string, qrText: string) {
    const at = parseAtQr(qrText);
    if (!at) throw new Error('QR Code AT inválido');
    const mapped = atQrToDocumentFields(at);
    const doc = await this.prisma.document.findFirst({ where: { id: documentId, tenantId } });
    if (!doc) throw new Error('Documento não encontrado');
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        nif: mapped.nif || doc.nif,
        docNumber: mapped.docNumber || doc.docNumber,
        docDate: mapped.docDate ? new Date(mapped.docDate) : doc.docDate,
        total: mapped.total ?? doc.total,
        iva: mapped.iva ?? doc.iva,
        status: 'em_revisao',
        metadata: { ...((doc.metadata as any) || {}), atQr: at, source: 'at_qr' },
      },
      include: { party: true },
    });
    return { document: updated, atQr: at };
  }

  async processDocument(tenantId: string, userId: string, documentId: string) {
    const doc = await this.prisma.document.findFirst({ where: { id: documentId, tenantId } });
    if (!doc) throw new Error('Documento não encontrado');
    const fullPath = path.isAbsolute(doc.fileKey)
      ? doc.fileKey
      : path.join(process.cwd(), 'uploads', doc.fileKey);

    let text = '';
    let engine = 'none';
    try {
      const pre = await extractTextFromFile(fullPath, doc.mimeType, doc.fileName);
      text = pre.text || '';
      engine = pre.engine;
    } catch (e) {
      this.logger.warn(`Pré-OCR: ${e}`);
    }

    const qrLine =
      text.split(/\n/).find((l) => isLikelyAtQr(l)) ||
      (isLikelyAtQr(text.replace(/\s/g, '')) ? text.replace(/\s/g, '') : null);
    const qrFields: any = {};
    if (qrLine) {
      const at = parseAtQr(qrLine.replace(/\s/g, ''));
      if (at) {
        Object.assign(qrFields, atQrToDocumentFields(at), { source: 'at_qr' });
        engine = 'at_qr+' + engine;
        this.logger.log('QR AT detectado');
      }
    }

    if (aiConfigured()) {
      try {
        const g = await extractWithAi({
          filePath: fullPath,
          mimeType: doc.mimeType,
          fileName: doc.fileName,
          knownFields: Object.keys(qrFields).length ? qrFields : undefined,
        });
        if (g) {
          const name = supplierName(g.supplier);
          const extracted: ExtractedFields = {
            supplier: name,
            nif: qrFields.nif || g.nif,
            docNumber: qrFields.docNumber || g.docNumber,
            docDate: qrFields.docDate || g.docDate,
            dueDate: g.dueDate,
            total: qrFields.total ?? g.total,
            iva: qrFields.iva ?? g.iva,
            currency: g.currency || 'EUR',
            confidence: Math.max(g.confidence || 0, qrFields.nif ? 0.95 : 0),
            rawHints: ['source:ai', engine],
          };
          const data: any = {
            metadata: {
              ...((doc.metadata as any) || {}),
              extraction: extracted,
              extractedAt: new Date().toISOString(),
              ocrEngine: g.provider,
              qr: qrFields.source || null,
              aiNotes: g.notes || null,
            },
          };
          if (name && !doc.supplier) data.supplier = name;
          if (extracted.nif && !doc.nif) data.nif = extracted.nif;
          if (extracted.docNumber && !doc.docNumber) data.docNumber = extracted.docNumber;
          if (extracted.total != null && doc.total == null) data.total = extracted.total;
          if (extracted.iva != null && doc.iva == null) data.iva = extracted.iva;
          if (extracted.docDate && !doc.docDate) data.docDate = new Date(extracted.docDate);
          if (extracted.dueDate && !doc.dueDate) data.dueDate = new Date(extracted.dueDate);
          data.type = mapType(g.type);
          data.status = 'em_revisao';

          if (name || extracted.nif) {
            try {
              const party = await this.parties.matchOrCreate(tenantId, userId, {
                name: name || `NIF ${extracted.nif}`,
                nif: extracted.nif,
                type: PartyType.supplier,
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
          this.logger.log(`AI extract ok ${doc.fileName} engine=${g.provider}`);
          return { document: updated, extracted };
        }
      } catch (e: any) {
        this.logger.warn(`AI failed, fallback Tesseract: ${e?.message || e}`);
      }
    }

    const extracted = this.extractFromText(text + '\n' + (doc.fileName || ''));
    const data: any = {
      metadata: {
        ...((doc.metadata as any) || {}),
        extraction: extracted,
        extractedAt: new Date().toISOString(),
        ocrEngine: engine,
      },
    };
    if (extracted.nif && !doc.nif) data.nif = extracted.nif;
    if (extracted.docNumber && !doc.docNumber) data.docNumber = extracted.docNumber;
    if (extracted.total != null && doc.total == null) data.total = extracted.total;
    if (extracted.confidence >= 0.4) data.status = 'em_revisao';
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data,
      include: { party: true },
    });
    return { document: updated, extracted };
  }
}
