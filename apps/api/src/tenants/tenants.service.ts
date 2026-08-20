import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async get(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t) throw new NotFoundException();
    return t;
  }

  async updateSettings(
    tenantId: string,
    data: {
      name?: string;
      nif?: string;
      iban?: string;
      bic?: string;
      bankName?: string;
      address?: string;
      settings?: any;
    },
  ) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.nif !== undefined && { nif: data.nif }),
        ...(data.iban !== undefined && { iban: data.iban }),
        ...(data.bic !== undefined && { bic: data.bic }),
        ...(data.bankName !== undefined && { bankName: data.bankName }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.settings !== undefined && { settings: data.settings }),
      },
    });
  }
}
