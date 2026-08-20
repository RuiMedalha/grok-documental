import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface SearchHit {
  id: string;
  type: 'document' | 'party' | 'transaction' | 'payable';
  title: string;
  subtitle?: string;
  href: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async search(tenantId: string, q: string, limit = 8): Promise<{
    query: string;
    total: number;
    results: SearchHit[];
  }> {
    const term = (q || '').trim();
    if (term.length < 2) {
      return { query: term, total: 0, results: [] };
    }

    const take = Math.min(Math.max(limit, 1), 20);

    const [docs, parties, txs, payables] = await Promise.all([
      this.prisma.document.findMany({
        where: {
          tenantId,
          OR: [
            { fileName: { contains: term, mode: 'insensitive' } },
            { supplier: { contains: term, mode: 'insensitive' } },
            { customer: { contains: term, mode: 'insensitive' } },
            { docNumber: { contains: term, mode: 'insensitive' } },
            { nif: { contains: term, mode: 'insensitive' } },
            { finalFolder: { contains: term, mode: 'insensitive' } },
            { suggestedFolder: { contains: term, mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          fileName: true,
          type: true,
          status: true,
          supplier: true,
          total: true,
          docNumber: true,
        },
      }),
      this.prisma.party.findMany({
        where: {
          tenantId,
          isActive: true,
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { nif: { contains: term, mode: 'insensitive' } },
            { email: { contains: term, mode: 'insensitive' } },
            { iban: { contains: term, mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
        take,
      }),
      this.prisma.bankTransaction.findMany({
        where: {
          tenantId,
          OR: [
            { description: { contains: term, mode: 'insensitive' } },
            { reference: { contains: term, mode: 'insensitive' } },
          ],
        },
        orderBy: { date: 'desc' },
        take,
      }),
      this.prisma.payableItem.findMany({
        where: {
          tenantId,
          OR: [
            { description: { contains: term, mode: 'insensitive' } },
            { party: { name: { contains: term, mode: 'insensitive' } } },
          ],
        },
        include: { party: true },
        orderBy: { dueDate: 'asc' },
        take,
      }),
    ]);

    const results: SearchHit[] = [];

    for (const d of docs) {
      results.push({
        id: d.id,
        type: 'document',
        title: d.fileName,
        subtitle: [d.type, d.status, d.supplier, d.docNumber]
          .filter(Boolean)
          .join(' · '),
        href: `/documents/${d.id}`,
        meta: { total: d.total != null ? Number(d.total) : null },
      });
    }
    for (const p of parties) {
      results.push({
        id: p.id,
        type: 'party',
        title: p.name,
        subtitle: [p.type, p.nif, p.email].filter(Boolean).join(' · '),
        href: '/parties',
        meta: { nif: p.nif },
      });
    }
    for (const tx of txs) {
      results.push({
        id: tx.id,
        type: 'transaction',
        title: tx.description || 'Movimento',
        subtitle: [
          tx.date?.toLocaleDateString('pt-PT'),
          tx.amount != null
            ? `${Number(tx.amount).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`
            : null,
          tx.reference,
        ]
          .filter(Boolean)
          .join(' · '),
        href: '/bank',
        meta: { amount: tx.amount != null ? Number(tx.amount) : null },
      });
    }
    for (const pay of payables) {
      results.push({
        id: pay.id,
        type: 'payable',
        title: pay.party?.name || pay.description || 'A pagar',
        subtitle: [
          pay.status,
          `${Number(pay.amount).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`,
          pay.dueDate ? `venc. ${pay.dueDate.toLocaleDateString('pt-PT')}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        href: '/payables',
      });
    }

    return { query: term, total: results.length, results };
  }
}
