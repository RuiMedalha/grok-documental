import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AppNotification {
  id: string;
  type: 'payable_overdue' | 'payable_due_soon' | 'inbox' | 'match_pending';
  title: string;
  body: string;
  href?: string;
  severity: 'info' | 'warning' | 'danger';
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string): Promise<AppNotification[]> {
    const now = new Date();
    const in7 = new Date(now);
    in7.setDate(in7.getDate() + 7);

    const [overdue, dueSoon, inboxCount, pendingMatches] = await Promise.all([
      this.prisma.payableItem.findMany({
        where: {
          tenantId,
          status: { in: ['to_pay', 'scheduled'] },
          dueDate: { lt: now },
        },
        include: { party: true },
        take: 10,
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.payableItem.findMany({
        where: {
          tenantId,
          status: { in: ['to_pay', 'scheduled'] },
          dueDate: { gte: now, lte: in7 },
        },
        include: { party: true },
        take: 10,
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.document.count({
        where: { tenantId, status: 'novo' },
      }),
      this.prisma.matchSuggestion.count({
        where: { tenantId, status: 'pending' },
      }),
    ]);

    const notes: AppNotification[] = [];

    for (const p of overdue) {
      notes.push({
        id: `overdue-${p.id}`,
        type: 'payable_overdue',
        title: 'Pagamento vencido',
        body: `${p.party?.name || p.description || 'Fornecedor'} · ${Number(p.amount).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} €`,
        href: '/payables',
        severity: 'danger',
        createdAt: (p.dueDate || p.createdAt).toISOString(),
      });
    }
    for (const p of dueSoon) {
      notes.push({
        id: `due-${p.id}`,
        type: 'payable_due_soon',
        title: 'Vence em breve',
        body: `${p.party?.name || p.description || 'Fornecedor'} · ${Number(p.amount).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} € · ${p.dueDate?.toLocaleDateString('pt-PT')}`,
        href: '/payables',
        severity: 'warning',
        createdAt: (p.dueDate || p.createdAt).toISOString(),
      });
    }
    if (inboxCount > 0) {
      notes.push({
        id: 'inbox',
        type: 'inbox',
        title: 'Inbox',
        body: `${inboxCount} documento(s) por processar`,
        href: '/inbox',
        severity: 'info',
        createdAt: now.toISOString(),
      });
    }
    if (pendingMatches > 0) {
      notes.push({
        id: 'matches',
        type: 'match_pending',
        title: 'Conciliação',
        body: `${pendingMatches} sugestão(ões) pendente(s)`,
        href: '/reconciliation',
        severity: 'info',
        createdAt: now.toISOString(),
      });
    }

    return notes;
  }
}
