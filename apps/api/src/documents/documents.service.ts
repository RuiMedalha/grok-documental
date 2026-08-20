import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
  Optional,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDocumentDto, DocumentQueryDto } from './dto/document.dto';
import { DocumentOrigin, DocumentStatus, AuditAction } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { toCsv, formatDatePt, formatNumberPt } from '../common/export.util';
import { ExtractionService } from '../extraction/extraction.service';

@Injectable()
export class DocumentsService {
  private uploadDir: string;

  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Optional() @Inject(forwardRef(() => ExtractionService))
    private extraction?: ExtractionService,
  ) {
    this.uploadDir = path.join(process.cwd(), 'uploads');
  }

  async ensureUploadDir() {
    await fs.mkdir(this.uploadDir, { recursive: true });
  }

  private async computeHash(buffer: Buffer): Promise<string> {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  async upload(
    tenantId: string,
    userId: string,
    file: Express.Multer.File,
    origin: DocumentOrigin = DocumentOrigin.upload,
  ) {
    await this.ensureUploadDir();

    const fileHash = await this.computeHash(file.buffer);

    // Duplicate check by hash
    const existing = await this.prisma.document.findFirst({
      where: { tenantId, fileHash },
    });
    if (existing) {
      throw new ConflictException({
        message: 'Duplicate document detected (same file hash)',
        existingId: existing.id,
      });
    }

    const ext = path.extname(file.originalname) || '';
    const fileKey = `${tenantId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    const fullPath = path.join(this.uploadDir, fileKey);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.buffer);

    // Apply simple folder suggestion
    const now = new Date();
    const suggestedFolder = `/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/outro/Inbox`;

    const doc = await this.prisma.document.create({
      data: {
        tenantId,
        uploadedById: userId,
        origin,
        fileName: file.originalname,
        fileKey,
        fileHash,
        mimeType: file.mimetype,
        fileSize: file.size,
        status: DocumentStatus.novo,
        suggestedFolder,
        finalFolder: suggestedFolder,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AuditAction.upload,
        entityType: 'document',
        entityId: doc.id,
        metadata: { fileName: file.originalname, size: file.size },
      },
    });

    // Auto-extract fields in background (heuristics / OCR pipeline)
    if (this.extraction) {
      this.extraction
        .processDocument(tenantId, userId, doc.id)
        .then(() => this.logger.log(`Auto-extract done for ${doc.id}`))
        .catch((err) => this.logger.warn(`Auto-extract failed: ${err?.message || err}`));
    }

    return this.sanitize(doc);
  }

  async findAll(tenantId: string, query: DocumentQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.search) {
      where.OR = [
        { fileName: { contains: query.search, mode: 'insensitive' } },
        { supplier: { contains: query.search, mode: 'insensitive' } },
        { customer: { contains: query.search, mode: 'insensitive' } },
        { docNumber: { contains: query.search, mode: 'insensitive' } },
        { nif: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      items: items.map((d) => this.sanitize(d)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findInbox(tenantId: string, query: DocumentQueryDto) {
    return this.findAll(tenantId, {
      ...query,
      status: DocumentStatus.novo,
    });
  }

  async findOne(tenantId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return this.sanitize(doc);
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateDocumentDto) {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const updated = await this.prisma.document.update({
      where: { id },
      data: {
        ...dto,
        docDate: dto.docDate ? new Date(dto.docDate) : undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AuditAction.edit,
        entityType: 'document',
        entityId: id,
        metadata: dto,
      },
    });

    return this.sanitize(updated);
  }

  async getFileUrl(tenantId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    // For MVP: local signed-like path (in prod use S3 presigned URL)
    return {
      url: `/api/documents/${id}/download`,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
    };
  }

  async getFileBuffer(tenantId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, tenantId },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const fullPath = path.join(this.uploadDir, doc.fileKey);
    try {
      const buffer = await fs.readFile(fullPath);
      return { buffer, mimeType: doc.mimeType, fileName: doc.fileName };
    } catch {
      throw new NotFoundException('File not found on storage');
    }
  }

  async checkDuplicates(tenantId: string, docNumber?: string, total?: number, docDate?: Date) {
    if (!docNumber && total == null) return [];

    const where: any = { tenantId };
    if (docNumber) where.docNumber = docNumber;
    if (total != null) where.total = total;
    if (docDate) {
      const start = new Date(docDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(docDate);
      end.setHours(23, 59, 59, 999);
      where.docDate = { gte: start, lte: end };
    }

    return this.prisma.document.findMany({
      where,
      select: { id: true, fileName: true, docNumber: true, total: true, docDate: true },
      take: 10,
    });
  }

  async exportCsv(tenantId: string, query: { status?: string; type?: string; search?: string } = {}) {
    const where: any = { tenantId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.search) {
      where.OR = [
        { fileName: { contains: query.search, mode: 'insensitive' } },
        { supplier: { contains: query.search, mode: 'insensitive' } },
        { customer: { contains: query.search, mode: 'insensitive' } },
        { docNumber: { contains: query.search, mode: 'insensitive' } },
        { nif: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });

    const headers = [
      'ID',
      'Ficheiro',
      'Tipo',
      'Estado',
      'Origem',
      'Fornecedor',
      'Cliente',
      'NIF',
      'Nº Documento',
      'Data Doc',
      'Vencimento',
      'Total',
      'IVA',
      'Moeda',
      'Pasta',
      'Tags',
      'Criado em',
    ];
    const rows = items.map((d) => [
      d.id,
      d.fileName,
      d.type,
      d.status,
      d.origin,
      d.supplier,
      d.customer,
      d.nif,
      d.docNumber,
      formatDatePt(d.docDate),
      formatDatePt(d.dueDate),
      formatNumberPt(d.total != null ? Number(d.total) : null),
      formatNumberPt(d.iva != null ? Number(d.iva) : null),
      d.currency,
      d.finalFolder || d.suggestedFolder,
      (d.tags || []).join(', '),
      formatDatePt(d.createdAt),
    ]);
    return toCsv(headers, rows);
  }

  private sanitize(doc: any) {
    const { fileKey, fileHash, ...rest } = doc;
    return {
      ...rest,
      total: rest.total != null ? Number(rest.total) : null,
      iva: rest.iva != null ? Number(rest.iva) : null,
    };
  }
}
