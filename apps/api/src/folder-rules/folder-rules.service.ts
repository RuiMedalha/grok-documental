import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { applyFolderPattern } from './folder-pattern.util';

@Injectable()
export class FolderRulesService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.folderRule.findMany({
      where: { tenantId },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });
  }

  async create(
    tenantId: string,
    data: {
      name: string;
      priority?: number;
      conditions?: any;
      folderPattern: string;
    },
  ) {
    return this.prisma.folderRule.create({
      data: {
        tenantId,
        name: data.name,
        priority: data.priority ?? 0,
        conditions: data.conditions ?? {},
        folderPattern: data.folderPattern,
      },
    });
  }

  async update(tenantId: string, id: string, data: any) {
    const rule = await this.prisma.folderRule.findFirst({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException('Regra não encontrada');
    return this.prisma.folderRule.update({ where: { id }, data });
  }

  async delete(tenantId: string, id: string) {
    const rule = await this.prisma.folderRule.findFirst({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException('Regra não encontrada');
    await this.prisma.folderRule.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Evaluate rules against a document context and return suggested folder.
   */
  async suggestFolder(
    tenantId: string,
    ctx: {
      type?: string;
      supplier?: string;
      customer?: string;
      emailDomain?: string;
      keywords?: string[];
      year?: number;
      month?: number;
    },
  ): Promise<string> {
    const rules = await this.prisma.folderRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: { priority: 'desc' },
    });

    for (const rule of rules) {
      const conditions = (rule.conditions as any) || {};
      let match = true;

      if (conditions.type && ctx.type && conditions.type !== ctx.type) match = false;
      if (conditions.supplier && ctx.supplier) {
        if (!ctx.supplier.toLowerCase().includes(String(conditions.supplier).toLowerCase())) {
          match = false;
        }
      }
      if (conditions.emailDomain && ctx.emailDomain) {
        if (ctx.emailDomain.toLowerCase() !== String(conditions.emailDomain).toLowerCase()) {
          match = false;
        }
      }
      if (conditions.keywords && Array.isArray(conditions.keywords) && ctx.keywords) {
        const found = conditions.keywords.some((kw: string) =>
          ctx.keywords!.some((k) => k.toLowerCase().includes(kw.toLowerCase())),
        );
        if (!found) match = false;
      }

      if (match) {
        return applyFolderPattern(rule.folderPattern, {
          year: ctx.year,
          month: ctx.month,
          type: ctx.type,
          entity: ctx.supplier || ctx.customer || 'Geral',
        });
      }
    }

    // Default fallback
    return applyFolderPattern('/{Ano}/{Mes}/{Tipo}/{Entidade}', {
      year: ctx.year,
      month: ctx.month,
      type: ctx.type || 'outro',
      entity: ctx.supplier || ctx.customer || 'Inbox',
    });
  }
}
