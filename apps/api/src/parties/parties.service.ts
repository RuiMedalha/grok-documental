import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PartyType } from '@prisma/client';

@Injectable()
export class PartiesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(tenantId: string, opts: { type?: string; search?: string; limit?: number } = {}) {
    const where: any = { tenantId, isActive: true };
    if (opts.type && opts.type !== 'all') {
      where.OR = [{ type: opts.type }, { type: 'both' }];
    }
    if (opts.search) {
      where.AND = [
        {
          OR: [
            { name: { contains: opts.search, mode: 'insensitive' } },
            { nif: { contains: opts.search, mode: 'insensitive' } },
            { email: { contains: opts.search, mode: 'insensitive' } },
          ],
        },
      ];
    }
    return this.prisma.party.findMany({
      where,
      orderBy: { name: 'asc' },
      take: opts.limit || 100,
    });
  }

  async get(tenantId: string, id: string) {
    const p = await this.prisma.party.findFirst({ where: { id, tenantId } });
    if (!p) throw new NotFoundException('Entidade não encontrada');
    return p;
  }

  async create(tenantId: string, userId: string, data: any) {
    if (data.nif) {
      const exists = await this.prisma.party.findFirst({
        where: { tenantId, nif: data.nif },
      });
      if (exists) throw new ConflictException('Já existe entidade com este NIF');
    }
    const party = await this.prisma.party.create({
      data: {
        tenantId,
        type: data.type || PartyType.supplier,
        name: data.name,
        nif: data.nif,
        email: data.email,
        phone: data.phone,
        iban: data.iban,
        address: data.address,
        city: data.city,
        postalCode: data.postalCode,
        country: data.country || 'PT',
        defaultDebitAccountId: data.defaultDebitAccountId,
        defaultCreditAccountId: data.defaultCreditAccountId,
        paymentTermDays: data.paymentTermDays ?? 30,
        externalIds: data.externalIds,
        notes: data.notes,
      },
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'edit',
      entityType: 'party',
      entityId: party.id,
      metadata: { created: true, name: party.name },
    });
    return party;
  }

  async update(tenantId: string, userId: string, id: string, data: any) {
    await this.get(tenantId, id);
    const party = await this.prisma.party.update({
      where: { id },
      data: {
        ...(data.type !== undefined && { type: data.type }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.nif !== undefined && { nif: data.nif }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.iban !== undefined && { iban: data.iban }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.postalCode !== undefined && { postalCode: data.postalCode }),
        ...(data.country !== undefined && { country: data.country }),
        ...(data.defaultDebitAccountId !== undefined && {
          defaultDebitAccountId: data.defaultDebitAccountId,
        }),
        ...(data.defaultCreditAccountId !== undefined && {
          defaultCreditAccountId: data.defaultCreditAccountId,
        }),
        ...(data.paymentTermDays !== undefined && { paymentTermDays: data.paymentTermDays }),
        ...(data.externalIds !== undefined && { externalIds: data.externalIds }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
    await this.audit.log({
      tenantId,
      userId,
      action: 'edit',
      entityType: 'party',
      entityId: id,
    });
    return party;
  }

  /** Find or create party from document extraction (NIF/name) */
  async matchOrCreate(
    tenantId: string,
    userId: string,
    input: { name?: string; nif?: string; type?: PartyType },
  ) {
    if (input.nif) {
      const byNif = await this.prisma.party.findFirst({
        where: { tenantId, nif: input.nif },
      });
      if (byNif) return byNif;
    }
    if (input.name) {
      const byName = await this.prisma.party.findFirst({
        where: {
          tenantId,
          name: { equals: input.name, mode: 'insensitive' },
        },
      });
      if (byName) return byName;
    }
    if (!input.name && !input.nif) return null;
    return this.create(tenantId, userId, {
      name: input.name || `NIF ${input.nif}`,
      nif: input.nif,
      type: input.type || PartyType.supplier,
    });
  }

  /** Import from CRM payload (generic) */
  async upsertFromCrm(tenantId: string, userId: string, rows: any[], provider: string) {
    const results = [];
    for (const row of rows) {
      const externalIds = { [provider]: row.externalId || row.id };
      let party = null;
      if (row.nif) {
        party = await this.prisma.party.findFirst({ where: { tenantId, nif: row.nif } });
      }
      if (!party && row.externalId) {
        // search by json is limited; fallback name
        party = await this.prisma.party.findFirst({
          where: {
            tenantId,
            name: { equals: row.name, mode: 'insensitive' },
          },
        });
      }
      if (party) {
        party = await this.update(tenantId, userId, party.id, {
          ...row,
          externalIds: { ...(party.externalIds as any), ...externalIds },
        });
      } else {
        party = await this.create(tenantId, userId, { ...row, externalIds });
      }
      results.push(party);
    }
    return { imported: results.length, items: results };
  }
}
