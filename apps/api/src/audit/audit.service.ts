import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    tenantId: string;
    userId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown> | null;
  }) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId || null,
          action: params.action,
          entityType: params.entityType || null,
          entityId: params.entityId || null,
          metadata: (params.metadata ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
        },
      });
    } catch {
      return null;
    }
  }
}
