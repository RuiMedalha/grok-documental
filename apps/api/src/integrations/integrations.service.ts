import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ToconlineService } from './toconline.service';

@Injectable()
export class IntegrationsService {
  constructor(
    private prisma: PrismaService,
    private toconline: ToconlineService,
  ) {}

  async list(tenantId: string) {
    return this.prisma.integration.findMany({
      where: { tenantId },
      select: {
        id: true,
        provider: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
  }

  async upsert(
    tenantId: string,
    provider: string,
    credentials: Record<string, any>,
  ) {
    const allowed = [
      'woocommerce',
      'ifthenpay',
      'moloni',
      'toconline',
      'hubspot',
      'pipedrive',
    ];
    if (!allowed.includes(provider)) {
      throw new BadRequestException(
        `Provider inválido. Use: ${allowed.join(', ')}`,
      );
    }

    if (provider === 'toconline') {
      return this.toconline.saveCredentials(tenantId, credentials as any);
    }

    return this.prisma.integration.upsert({
      where: { tenantId_provider: { tenantId, provider } },
      update: { credentials, isActive: true },
      create: { tenantId, provider, credentials, isActive: true },
      select: {
        id: true,
        provider: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
  }

  async deactivate(tenantId: string, provider: string) {
    const row = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!row) throw new NotFoundException('Integração não encontrada');
    return this.prisma.integration.update({
      where: { id: row.id },
      data: { isActive: false },
    });
  }

  async syncWooCommerceOrders(tenantId: string) {
    const int = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider: 'woocommerce' } },
    });
    if (!int || !int.isActive) {
      throw new BadRequestException('WooCommerce não configurado ou inativo');
    }
    await this.prisma.integration.update({
      where: { id: int.id },
      data: { lastSyncAt: new Date() },
    });
    return {
      synced: 0,
      message: 'WooCommerce connector stub – implementar API real',
    };
  }

  async handleIfthenpayCallback(tenantId: string | null, payload: any) {
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      return { received: true, processed: false, reason: 'tenant_id required' };
    }

    const amount = Number(payload?.amount || payload?.valor || 0);
    const reference = payload?.reference || payload?.ref || null;
    const externalId = payload?.id || payload?.transaction_id || null;

    const payment = await this.prisma.payment.create({
      data: {
        tenantId: resolvedTenantId,
        amount,
        reference: reference ? String(reference) : null,
        provider: 'ifthenpay',
        externalId: externalId ? String(externalId) : null,
        status: 'paid',
        rawPayload: payload,
      },
    });

    if (reference) {
      const invoice = await this.prisma.invoice.findFirst({
        where: {
          tenantId: resolvedTenantId,
          number: String(reference),
        },
      });
      if (invoice) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { invoiceId: invoice.id },
        });
      }
    }

    return { received: true, processed: true, paymentId: payment.id };
  }

  async syncMoloniInvoices(tenantId: string) {
    const int = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider: 'moloni' } },
    });
    if (!int || !int.isActive) {
      throw new BadRequestException('Moloni não configurado ou inativo');
    }
    await this.prisma.integration.update({
      where: { id: int.id },
      data: { lastSyncAt: new Date() },
    });
    return {
      synced: 0,
      message: 'Moloni connector stub – implementar API real',
    };
  }

  getToconlineConfig(tenantId: string) {
    return this.toconline.getConfig(tenantId);
  }

  getToconlineAuthorizeUrl(tenantId: string, redirectUri: string) {
    return this.toconline.getAuthorizeUrl(tenantId, redirectUri);
  }

  exchangeToconlineCode(tenantId: string, code: string) {
    return this.toconline.exchangeCode(tenantId, code);
  }

  pushToToconline(tenantId: string, documentId: string, dryRun?: boolean) {
    return this.toconline.pushPurchaseDocument(tenantId, documentId, {
      dryRun,
    });
  }

  pushManyToToconline(
    tenantId: string,
    documentIds: string[],
    dryRun?: boolean,
  ) {
    return this.toconline.pushMany(tenantId, documentIds, dryRun);
  }

  toconlineExportLogs(tenantId: string) {
    return this.toconline.listExportLogs(tenantId);
  }

  async getCrmContacts(tenantId: string, provider: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider } },
    });
    if (!integration?.isActive) {
      return {
        provider,
        status: 'not_configured',
        message: 'Configure as credenciais CRM em Definições',
        rows: [],
      };
    }
    const creds = integration.credentials as any;
    if (!creds?.apiKey && !creds?.accessToken) {
      return {
        provider,
        status: 'mock',
        rows: [
          {
            externalId: 'crm-1',
            name: 'Fornecedor Exemplo Lda',
            nif: '500000000',
            email: 'compras@exemplo.pt',
            type: 'supplier',
          },
          {
            externalId: 'crm-2',
            name: 'Cliente Demo SA',
            nif: '501000000',
            email: 'geral@cliente.pt',
            type: 'customer',
          },
        ],
      };
    }
    return {
      provider,
      status: 'ready',
      message: 'Ligue o fetch real da API do CRM aqui',
      rows: [],
      credentialsPresent: true,
    };
  }
}
