import { toCsv, formatDatePt, formatNumberPt } from '../common/export.util';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCsvTemplateDto,
  PreviewCsvDto,
  ImportCsvDto,
  BankTransactionQueryDto,
} from './dto/bank.dto';
import { parseCsvContent, computeFileHash } from './csv-parser.util';
import { AuditAction } from '@prisma/client';

@Injectable()
export class BankService {
  constructor(private prisma: PrismaService) {}

  // ── Templates ──────────────────────────────────────────────

  async listTemplates(tenantId: string) {
    return this.prisma.csvTemplate.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async createTemplate(tenantId: string, dto: CreateCsvTemplateDto) {
    const existing = await this.prisma.csvTemplate.findUnique({
      where: { tenantId_name: { tenantId, name: dto.name } },
    });
    if (existing) throw new ConflictException('Template com este nome já existe');

    return this.prisma.csvTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        mapping: dto.mapping as any,
        dateFormat: dto.dateFormat || 'DD/MM/YYYY',
        decimalSep: dto.decimalSep || ',',
        thousandSep: dto.thousandSep || '.',
        hasHeader: dto.hasHeader !== false,
      },
    });
  }

  async deleteTemplate(tenantId: string, id: string) {
    const t = await this.prisma.csvTemplate.findFirst({ where: { id, tenantId } });
    if (!t) throw new NotFoundException('Template não encontrado');
    await this.prisma.csvTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Preview (wizard step) ──────────────────────────────────

  previewCsv(content: string, dto: PreviewCsvDto) {
    const result = parseCsvContent(content, {
      mapping: dto.mapping,
      dateFormat: dto.dateFormat,
      decimalSep: dto.decimalSep,
      thousandSep: dto.thousandSep,
      hasHeader: dto.hasHeader,
    });

    return {
      headers: result.headers,
      preview: result.rows.slice(0, 20).map((r) => ({
        date: r.date.toISOString().slice(0, 10),
        description: r.description,
        amount: r.amount,
        balance: r.balance,
        reference: r.reference,
      })),
      totalRows: result.rows.length,
      errors: result.errors.slice(0, 10),
      hasMoreErrors: result.errors.length > 10,
    };
  }

  // ── Import ─────────────────────────────────────────────────

  async importCsv(
    tenantId: string,
    userId: string,
    content: string,
    dto: ImportCsvDto,
  ) {
    const fileHash = computeFileHash(content);

    // Prevent duplicate import of same file
    const existingImport = await this.prisma.bankTransaction.findFirst({
      where: { tenantId, importHash: fileHash },
    });
    if (existingImport) {
      throw new ConflictException(
        'Este ficheiro já foi importado anteriormente (mesmo hash)',
      );
    }

    const parsed = parseCsvContent(content, {
      mapping: dto.mapping,
      dateFormat: dto.dateFormat,
      decimalSep: dto.decimalSep,
      thousandSep: dto.thousandSep,
      hasHeader: dto.hasHeader,
    });

    if (parsed.errors.length && parsed.rows.length === 0) {
      throw new BadRequestException({
        message: 'Erro ao processar CSV',
        errors: parsed.errors,
      });
    }

    // Optional: save template
    if (dto.saveAsTemplate) {
      await this.prisma.csvTemplate.upsert({
        where: {
          tenantId_name: { tenantId, name: dto.saveAsTemplate },
        },
        update: {
          mapping: dto.mapping as any,
          dateFormat: dto.dateFormat || 'DD/MM/YYYY',
          decimalSep: dto.decimalSep || ',',
          thousandSep: dto.thousandSep || '.',
          hasHeader: dto.hasHeader !== false,
        },
        create: {
          tenantId,
          name: dto.saveAsTemplate,
          mapping: dto.mapping as any,
          dateFormat: dto.dateFormat || 'DD/MM/YYYY',
          decimalSep: dto.decimalSep || ',',
          thousandSep: dto.thousandSep || '.',
          hasHeader: dto.hasHeader !== false,
        },
      });
    }

    // Bulk insert
    const data = parsed.rows.map((r) => ({
      tenantId,
      date: r.date,
      description: r.description,
      amount: r.amount,
      balance: r.balance ?? null,
      reference: r.reference ?? null,
      rawRowJson: r.raw,
      importHash: fileHash,
    }));

    const result = await this.prisma.$transaction(async (tx) => {
      // createMany doesn't return count of actual inserts in all drivers consistently,
      // so we do it and then count
      await tx.bankTransaction.createMany({ data });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: AuditAction.import,
          entityType: 'bank_transaction',
          metadata: {
            rows: data.length,
            fileHash,
            errors: parsed.errors.length,
          },
        },
      });

      return data.length;
    });

    return {
      imported: result,
      errors: parsed.errors.slice(0, 20),
      fileHash,
    };
  }

  // ── List transactions ──────────────────────────────────────

  async listTransactions(tenantId: string, query: BankTransactionQueryDto) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 200);
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }
    if (query.search) {
      where.OR = [
        { description: { contains: query.search, mode: 'insensitive' } },
        { reference: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    return {
      items: items.map((t) => ({
        ...t,
        amount: Number(t.amount),
        balance: t.balance != null ? Number(t.balance) : null,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getTransaction(tenantId: string, id: string) {
    const t = await this.prisma.bankTransaction.findFirst({
      where: { id, tenantId },
    });
    if (!t) throw new NotFoundException('Transação não encontrada');
    return {
      ...t,
      amount: Number(t.amount),
      balance: t.balance != null ? Number(t.balance) : null,
    };
  }
  async exportCsv(tenantId: string, query: { from?: string; to?: string; search?: string } = {}) {
    const where: any = { tenantId };
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }
    if (query.search) {
      where.OR = [
        { description: { contains: query.search, mode: 'insensitive' } },
        { reference: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const items = await this.prisma.bankTransaction.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 10000,
    });
    const headers = ['ID', 'Data', 'Descrição', 'Valor', 'Saldo', 'Referência', 'Importado em'];
    const rows = items.map((t) => [
      t.id,
      formatDatePt(t.date),
      t.description,
      formatNumberPt(Number(t.amount)),
      formatNumberPt(t.balance != null ? Number(t.balance) : null),
      t.reference,
      formatDatePt(t.createdAt),
    ]);
    return toCsv(headers, rows);
  }

}
