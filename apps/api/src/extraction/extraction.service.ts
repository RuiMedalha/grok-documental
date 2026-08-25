import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { PartyType } from '@prisma/client';
import * as path from 'path';
import { parseAtQr, atQrToDocumentFields, isLikelyAtQr } from './at-qr.parser';
import { extractTextFromFile } from './ocr.util';
import { extractWithGemini, geminiConfigured } from './gemini.vision';

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

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);
  constructor(private prisma: PrismaService, private parties: PartiesService) {}

  extractFromText(text: string): ExtractedFields {
    const hints: string[] = [];
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
    const nif = nifMatch?.[1];
    const numMatch = normalized.match(/(?:Fatura|Factura|FT|Invoice)[:\s#]*([A-Z0-9\/\-]+)/i);
    const docNumber = numMatch?.[1]?.trim();
    const dateMatches = [...normalized.matchAll(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/g)];
    let docDate: string | undefined;
    if (dateMatches[0]) {
      const [, d, m, y] = dateMatches[0];
      docDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const parsePt = (s?: string) => {
      if (!s) return undefined;
      const n = parseFloat(s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    };
    const totalMatch = normalized.match(/(?:Total\s*(?:a\s*pagar)?|TOTAL)[:\s]*€?\s*([\d\.,]+)/i);
    const ivaMatch = normalized.match(/(?:IVA|VAT)[:\s]*€?\s*([\d\.,]+)/i);
    const supplierLine = normalized.match(/(?:Fornecedor|Emitente)[:\s]+([^\n]{3,80})/i);
    const total = parsePt(totalMatch?.[1]);
    const iva = parsePt(ivaMatch?.[1]);
    const supplier = supplierLine?.[1]?.trim();
    let confidence = 0.2;
    if (nif) confidence += 0.25;
    if (total != null) confidence += 0.25;
    if (docNumber) confidence += 0.15;
    if (docDate) confidence += 0.1;
    return {
      supplier,
      nif,
      docNumber,
      docDate,
      total,
      iva,
      currency: 'EUR',
      confidence: Math.min(confidence, 0.95),
      rawHints: hints,
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

    if (geminiConfigured()) {
      try {
        const g = await extractWithGemini({
          filePath: fullPath,
          mimeType: doc.mimeType,
          fileName: doc.fileName,
        });
        if (g) {
          const extracted = {
            supplier: g.supplier,
            nif: g.nif,
            docNumber: g.docNumber,
            docDate: g.docDate,
            dueDate: g.dueDate,
            total: g.total,
            iva: g.iva,
            currency: g.currency || 'EUR',
            confidence: g.confidence,
            rawHints: ['source:gemini-vision'],
          };
          const data: any = {
            metadata: {
              ...((doc.metadata as any) || {}),
              extraction: extracted,
              extractedAt: new Date().toISOString(),
              ocrEngine: 'gemini-vision',
              geminiNotes: g.notes || null,
            },
          };
          if (g.supplier && !doc.supplier) data.supplier = g.supplier;
          if (g.nif && !doc.nif) data.nif = g.nif;
          if (g.docNumber && !doc.docNumber) data.docNumber = g.docNumber;
          if (g.total != null && doc.total == null) data.total = g.total;
          if (g.iva != null && doc.iva == null) data.iva = g.iva;
          if (g.docDate && !doc.docDate) data.docDate = new Date(g.docDate);
          if (g.dueDate && !doc.dueDate) data.dueDate = new Date(g.dueDate);
          if (g.type) data.type = g.type;
          if (extracted.confidence >= 0.4) data.status = 'em_revisao';
          const updated = await this.prisma.document.update({
            where: { id: documentId },
            data,
            include: { party: true },
          });
          this.logger.log(`Gemini Vision ok ${doc.fileName}`);
          return { document: updated, extracted };
        }
      } catch (e: any) {
        this.logger.warn(`Gemini failed, fallback Tesseract: ${e?.message || e}`);
      }
    }

    let text = '';
    let engine = 'none';
    try {
      const ocr = await extractTextFromFile(fullPath, doc.mimeType, doc.fileName);
      text = ocr.text || '';
      engine = ocr.engine;
    } catch (e) {
      this.logger.warn(`OCR failed: ${e}`);
    }
    text = [text, doc.fileName, doc.supplier, doc.nif, doc.docNumber].filter(Boolean).join('\n');
    const extracted = this.extractFromText(text);
    const data: any = {
      metadata: {
        ...((doc.metadata as any) || {}),
        extraction: extracted,
        extractedAt: new Date().toISOString(),
        ocrEngine: engine,
      },
    };
    if (extracted.supplier && !doc.supplier) data.supplier = extracted.supplier;
    if (extracted.nif && !doc.nif) data.nif = extracted.nif;
    if (extracted.docNumber && !doc.docNumber) data.docNumber = extracted.docNumber;
    if (extracted.total != null && doc.total == null) data.total = extracted.total;
    if (extracted.iva != null && doc.iva == null) data.iva = extracted.iva;
    if (extracted.docDate && !doc.docDate) data.docDate = new Date(extracted.docDate);
    if (extracted.confidence >= 0.4) data.status = 'em_revisao';
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data,
      include: { party: true },
    });
    return { document: updated, extracted };
  }
}
