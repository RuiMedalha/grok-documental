import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { scoreMatch } from './matching.util';
import { AuditAction } from '@prisma/client';

@Injectable()
export class ReconciliationService {
  constructor(private prisma: PrismaService) {}

  /**
   * Run matching job for a tenant.
   * Matches BankTransactions against Documents (via total/date) and existing Expenses/Invoices.
   */
  async runMatching(tenantId: string, userId?: string) {
    // Get unmatched bank transactions (no accepted suggestion)
    const acceptedTxIds = await this.prisma.matchSuggestion.findMany({
      where: { tenantId, status: 'accepted' },
      select: { bankTransactionId: true },
    });
    const excludeIds = acceptedTxIds.map((m) => m.bankTransactionId);

    const transactions = await this.prisma.bankTransaction.findMany({
      where: {
        tenantId,
        id: excludeIds.length ? { notIn: excludeIds } : undefined,
      },
      orderBy: { date: 'desc' },
      take: 500,
    });

    // Candidates: documents with total, expenses, invoices
    const documents = await this.prisma.document.findMany({
      where: {
        tenantId,
        total: { not: null },
        status: { not: 'arquivado' },
      },
      select: {
        id: true,
        fileName: true,
        supplier: true,
        customer: true,
        docNumber: true,
        total: true,
        docDate: true,
        type: true,
      },
      take: 1000,
    });

    const expenses = await this.prisma.expense.findMany({
      where: { tenantId },
      take: 500,
    });

    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      take: 500,
    });

    // Clear previous pending suggestions for these transactions
    await this.prisma.matchSuggestion.deleteMany({
      where: {
        tenantId,
        status: 'pending',
        bankTransactionId: { in: transactions.map((t) => t.id) },
      },
    });

    const suggestions: any[] = [];

    for (const tx of transactions) {
      const amount = Number(tx.amount);
      const absAmount = Math.abs(amount);

      // Match against documents
      for (const doc of documents) {
        const docTotal = Number(doc.total);
        const result = scoreMatch({
          bankRef: tx.reference,
          bankDesc: tx.description,
          bankAmount: absAmount,
          bankDate: tx.date,
          entityRef: doc.docNumber,
          entityAmount: docTotal,
          entityDate: doc.docDate,
          entityDesc: doc.supplier || doc.customer || doc.fileName,
          orderNumber: doc.docNumber,
        });

        if (result) {
          suggestions.push({
            tenantId,
            bankTransactionId: tx.id,
            // We store document link via expense/invoice creation on accept,
            // for now use a synthetic approach: create pending with metadata
            score: result.score,
            matchType: result.matchType,
            status: 'pending',
            // temporary: we'll use expenseId/invoiceId null and store doc in a later field
            // For MVP we create an Expense on accept if needed
          });
        }
      }

      // Match against expenses
      for (const exp of expenses) {
        const result = scoreMatch({
          bankRef: tx.reference,
          bankDesc: tx.description,
          bankAmount: absAmount,
          bankDate: tx.date,
          entityAmount: Number(exp.amount),
          entityDate: exp.date,
          entityDesc: exp.description || exp.supplier,
        });
        if (result) {
          suggestions.push({
            tenantId,
            bankTransactionId: tx.id,
            expenseId: exp.id,
            score: result.score,
            matchType: result.matchType,
            status: 'pending',
          });
        }
      }

      // Match against invoices
      for (const inv of invoices) {
        const result = scoreMatch({
          bankRef: tx.reference,
          bankDesc: tx.description,
          bankAmount: absAmount,
          bankDate: tx.date,
          entityRef: inv.number,
          entityAmount: Number(inv.amount),
          entityDate: inv.date,
          entityDesc: inv.customer,
          orderNumber: inv.number,
        });
        if (result) {
          suggestions.push({
            tenantId,
            bankTransactionId: tx.id,
            invoiceId: inv.id,
            score: result.score,
            matchType: result.matchType,
            status: 'pending',
          });
        }
      }
    }

    // Keep only best match per transaction (highest score)
    const bestByTx = new Map<string, any>();
    for (const s of suggestions) {
      const existing = bestByTx.get(s.bankTransactionId);
      if (!existing || s.score > existing.score) {
        bestByTx.set(s.bankTransactionId, s);
      }
    }

    const toCreate = Array.from(bestByTx.values());

    if (toCreate.length) {
      await this.prisma.matchSuggestion.createMany({ data: toCreate });
    }

    if (userId) {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action: AuditAction.reconcile,
          metadata: { suggestionsCreated: toCreate.length },
        },
      });
    }

    return {
      scannedTransactions: transactions.length,
      suggestionsCreated: toCreate.length,
    };
  }

  async listSuggestions(tenantId: string, status = 'pending') {
    const items = await this.prisma.matchSuggestion.findMany({
      where: { tenantId, status },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      include: {
        bankTransaction: true,
        expense: true,
        invoice: true,
      },
      take: 100,
    });

    return items.map((s) => ({
      id: s.id,
      score: s.score,
      matchType: s.matchType,
      status: s.status,
      createdAt: s.createdAt,
      bankTransaction: s.bankTransaction
        ? {
            id: s.bankTransaction.id,
            date: s.bankTransaction.date,
            description: s.bankTransaction.description,
            amount: Number(s.bankTransaction.amount),
            reference: s.bankTransaction.reference,
          }
        : null,
      expense: s.expense
        ? {
            id: s.expense.id,
            description: s.expense.description,
            amount: Number(s.expense.amount),
            supplier: s.expense.supplier,
          }
        : null,
      invoice: s.invoice
        ? {
            id: s.invoice.id,
            number: s.invoice.number,
            amount: Number(s.invoice.amount),
            customer: s.invoice.customer,
          }
        : null,
    }));
  }

  async acceptSuggestion(tenantId: string, userId: string, id: string) {
    const suggestion = await this.prisma.matchSuggestion.findFirst({
      where: { id, tenantId },
      include: { bankTransaction: true },
    });
    if (!suggestion) throw new NotFoundException('Sugestão não encontrada');
    if (suggestion.status !== 'pending') {
      throw new BadRequestException('Sugestão já processada');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.matchSuggestion.update({
        where: { id },
        data: { status: 'accepted' },
      });

      // Reject other pending for same transaction
      await tx.matchSuggestion.updateMany({
        where: {
          tenantId,
          bankTransactionId: suggestion.bankTransactionId,
          status: 'pending',
          id: { not: id },
        },
        data: { status: 'rejected' },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action: AuditAction.approve,
          entityType: 'match_suggestion',
          entityId: id,
          metadata: {
            bankTransactionId: suggestion.bankTransactionId,
            score: suggestion.score,
          },
        },
      });
    });

    return { accepted: true };
  }

  async rejectSuggestion(tenantId: string, userId: string, id: string) {
    const suggestion = await this.prisma.matchSuggestion.findFirst({
      where: { id, tenantId },
    });
    if (!suggestion) throw new NotFoundException('Sugestão não encontrada');
    if (suggestion.status !== 'pending') {
      throw new BadRequestException('Sugestão já processada');
    }

    await this.prisma.matchSuggestion.update({
      where: { id },
      data: { status: 'rejected' },
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: AuditAction.reject,
        entityType: 'match_suggestion',
        entityId: id,
      },
    });

    return { rejected: true };
  }

  /**
   * Create an Expense from a document (helper for linking).
   */
  async createExpenseFromDocument(
    tenantId: string,
    documentId: string,
  ) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    if (doc.total == null) throw new BadRequestException('Documento sem valor total');

    return this.prisma.expense.create({
      data: {
        tenantId,
        documentId: doc.id,
        description: doc.fileName,
        amount: doc.total,
        date: doc.docDate,
        supplier: doc.supplier,
      },
    });
  }
}
