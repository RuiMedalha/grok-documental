import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AccountType } from '@prisma/client';

/** Plano de contas PT SNC (subset útil para MVP) */
export const DEFAULT_ACCOUNTS = [
  { code: '21', name: 'Clientes', type: AccountType.asset },
  { code: '221', name: 'Fornecedores c/c', type: AccountType.liability },
  { code: '31', name: 'Compras', type: AccountType.expense },
  { code: '62', name: 'Fornecimentos e serviços externos', type: AccountType.expense },
  { code: '2432', name: 'IVA dedutível', type: AccountType.asset },
  { code: '2433', name: 'IVA liquidado', type: AccountType.liability },
  { code: '12', name: 'Depósitos à ordem', type: AccountType.asset },
  { code: '71', name: 'Vendas', type: AccountType.revenue },
  { code: '72', name: 'Prestações de serviços', type: AccountType.revenue },
];

@Injectable()
export class AccountingService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async listAccounts(tenantId: string) {
    return this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      orderBy: { code: 'asc' },
    });
  }

  async seedDefaults(tenantId: string) {
    const existing = await this.prisma.account.count({ where: { tenantId } });
    if (existing > 0) {
      return this.listAccounts(tenantId);
    }
    await this.prisma.account.createMany({
      data: DEFAULT_ACCOUNTS.map((a) => ({ ...a, tenantId })),
      skipDuplicates: true,
    });
    return this.listAccounts(tenantId);
  }

  async createAccount(tenantId: string, data: { code: string; name: string; type?: AccountType }) {
    return this.prisma.account.create({
      data: {
        tenantId,
        code: data.code,
        name: data.name,
        type: data.type || AccountType.expense,
      },
    });
  }

  /**
   * Classificar documento: "débito a conta X / crédito a conta Y"
   * Gera 2 (ou 3 com IVA) linhas de diário e atualiza o documento.
   */
  async classifyDocument(
    tenantId: string,
    userId: string,
    documentId: string,
    input: {
      partyId?: string;
      debitAccountId: string;
      creditAccountId: string;
      costCenter?: string;
      schedulePayment?: boolean;
      paymentDueDate?: string;
    },
  ) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    const debit = await this.prisma.account.findFirst({
      where: { id: input.debitAccountId, tenantId },
    });
    const credit = await this.prisma.account.findFirst({
      where: { id: input.creditAccountId, tenantId },
    });
    if (!debit || !credit) throw new NotFoundException('Conta inválida');

    const total = Number(doc.total || 0);
    const iva = Number(doc.iva || 0);
    const base = total - iva;

    // Clear previous journal lines for this doc
    await this.prisma.journalLine.deleteMany({
      where: { tenantId, documentId },
    });

    const lines = [];
    if (base > 0) {
      lines.push(
        await this.prisma.journalLine.create({
          data: {
            tenantId,
            documentId,
            accountId: debit.id,
            description: `${doc.fileName} · ${debit.name}`,
            debit: base,
            credit: 0,
            date: doc.docDate || new Date(),
          },
        }),
      );
    }
    if (iva > 0) {
      // Find IVA account if exists
      const ivaAcc = await this.prisma.account.findFirst({
        where: { tenantId, code: { startsWith: '243' } },
      });
      if (ivaAcc) {
        lines.push(
          await this.prisma.journalLine.create({
            data: {
              tenantId,
              documentId,
              accountId: ivaAcc.id,
              description: `IVA · ${doc.fileName}`,
              debit: iva,
              credit: 0,
              date: doc.docDate || new Date(),
            },
          }),
        );
      }
    }
    lines.push(
      await this.prisma.journalLine.create({
        data: {
          tenantId,
          documentId,
          accountId: credit.id,
          description: `${doc.fileName} · ${credit.name}`,
          debit: 0,
          credit: total || base,
          date: doc.docDate || new Date(),
        },
      }),
    );

    let dueDate: Date | null = null;
    if (input.paymentDueDate) {
      dueDate = new Date(input.paymentDueDate);
    } else if (doc.dueDate) {
      dueDate = doc.dueDate;
    } else if (input.partyId) {
      const party = await this.prisma.party.findFirst({
        where: { id: input.partyId, tenantId },
      });
      if (party?.paymentTermDays && doc.docDate) {
        dueDate = new Date(doc.docDate);
        dueDate.setDate(dueDate.getDate() + party.paymentTermDays);
      }
    }

    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: {
        partyId: input.partyId || doc.partyId,
        debitAccountId: debit.id,
        creditAccountId: credit.id,
        costCenter: input.costCenter,
        status: 'processado',
        paymentStatus: input.schedulePayment ? 'to_pay' : doc.paymentStatus,
        paymentDueDate: dueDate,
      },
      include: {
        party: true,
        debitAccount: true,
        creditAccount: true,
        journalLines: { include: { account: true } },
      },
    });

    // Create payable if fatura recebida and schedulePayment
    if (input.schedulePayment && (doc.type === 'fatura_recebida' || total > 0)) {
      await this.prisma.payableItem.deleteMany({
        where: { tenantId, documentId },
      });
      await this.prisma.payableItem.create({
        data: {
          tenantId,
          documentId,
          partyId: input.partyId || doc.partyId,
          description: doc.fileName,
          amount: total,
          dueDate,
          status: 'to_pay',
        },
      });
    }

    await this.audit.log({
      tenantId,
      userId,
      action: 'edit',
      entityType: 'document',
      entityId: documentId,
      metadata: {
        accounting: true,
        debit: debit.code,
        credit: credit.code,
        schedulePayment: !!input.schedulePayment,
      },
    });

    return updated;
  }

  async getDocumentJournal(tenantId: string, documentId: string) {
    return this.prisma.journalLine.findMany({
      where: { tenantId, documentId },
      include: { account: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
