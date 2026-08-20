import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * TOConline connector
 *
 * Auth: OAuth2 (client_id + secret + API URLs from Empresa > Configurações > Dados API)
 * Docs: https://api-docs.toconline.pt/
 *
 * MVP: stores credentials, can push purchase document headers from DocFlow documents.
 * Full PDF attachment / lines mapping can be extended when scopes and endpoints are confirmed per tenant.
 */
@Injectable()
export class ToconlineService {
  private readonly logger = new Logger(ToconlineService.name);

  constructor(private prisma: PrismaService) {}

  async getConfig(tenantId: string) {
    const int = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider: 'toconline' } },
    });
    if (!int) return null;
    const creds = (int.credentials as any) || {};
    return {
      id: int.id,
      isActive: int.isActive,
      lastSyncAt: int.lastSyncAt,
      configured: !!(creds.clientId && creds.clientSecret && creds.apiUrl),
      hasToken: !!creds.accessToken,
      // never expose secrets
      clientId: creds.clientId ? `${String(creds.clientId).slice(0, 4)}…` : null,
      apiUrl: creds.apiUrl || null,
      oauthUrl: creds.oauthUrl || null,
    };
  }

  async saveCredentials(
    tenantId: string,
    credentials: {
      clientId: string;
      clientSecret: string;
      apiUrl: string;
      oauthUrl: string;
      redirectUri?: string;
      accessToken?: string;
      refreshToken?: string;
    },
  ) {
    if (!credentials.clientId || !credentials.clientSecret || !credentials.apiUrl || !credentials.oauthUrl) {
      throw new BadRequestException(
        'clientId, clientSecret, apiUrl e oauthUrl são obrigatórios (Dados API no TOConline)',
      );
    }

    return this.prisma.integration.upsert({
      where: { tenantId_provider: { tenantId, provider: 'toconline' } },
      update: {
        credentials: credentials as any,
        isActive: true,
      },
      create: {
        tenantId,
        provider: 'toconline',
        credentials: credentials as any,
        isActive: true,
      },
      select: {
        id: true,
        provider: true,
        isActive: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Exchange authorization code for tokens (simplified OAuth flow helper).
   * In production the redirect URI must match the one registered in TOConline.
   */
  async exchangeCode(tenantId: string, code: string) {
    const int = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider: 'toconline' } },
    });
    if (!int) throw new NotFoundException('TOConline não configurado');
    const creds = (int.credentials as any) || {};

    const tokenUrl = `${String(creds.oauthUrl).replace(/\/$/, '')}/token`;
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      scope: 'commercial',
    });

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${basic}`,
      },
      body: body.toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.error('TOConline token error', data);
      throw new BadRequestException(
        data?.error_description || data?.error || 'Falha ao obter token TOConline',
      );
    }

    const updated = {
      ...creds,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      tokenObtainedAt: new Date().toISOString(),
    };

    await this.prisma.integration.update({
      where: { id: int.id },
      data: { credentials: updated, lastSyncAt: new Date() },
    });

    return { success: true, hasAccessToken: !!data.access_token };
  }

  /**
   * Build OAuth authorize URL for the tenant.
   */
  getAuthorizeUrl(tenantId: string, redirectUri: string) {
    return this.prisma.integration
      .findUnique({
        where: { tenantId_provider: { tenantId, provider: 'toconline' } },
      })
      .then((int) => {
        if (!int) throw new NotFoundException('TOConline não configurado');
        const creds = (int.credentials as any) || {};
        const base = String(creds.oauthUrl).replace(/\/$/, '');
        const params = new URLSearchParams({
          client_id: creds.clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'commercial',
        });
        return { url: `${base}/auth?${params.toString()}` };
      });
  }

  /**
   * Push a DocFlow document as a commercial purchase document header to TOConline.
   * Uses API structure from api-docs.toconline.pt (commercial_purchases_documents).
   * If no live token / API fails, returns a dry-run payload for debugging.
   */
  async pushPurchaseDocument(tenantId: string, documentId: string, options?: { dryRun?: boolean }) {
    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, tenantId },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    const int = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider: 'toconline' } },
    });
    if (!int || !int.isActive) {
      throw new BadRequestException('TOConline não configurado ou inativo');
    }

    const creds = (int.credentials as any) || {};
    const payload = {
      date: doc.docDate
        ? doc.docDate.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      due_date: doc.dueDate ? doc.dueDate.toISOString().slice(0, 10) : undefined,
      document_type: 'FC', // Fatura de compra (ajustar série no TOConline)
      external_reference: doc.docNumber || doc.id,
      supplier_business_name: doc.supplier || undefined,
      notes: `Importado do DocFlow · ${doc.fileName}`,
      currency_iso_code: doc.currency || 'EUR',
      // lines would require item_id / tax_id from TOConline catalogue
      lines: [
        {
          description: doc.fileName,
          // placeholder amounts — real integration maps tax_id from TOConline
          gross_total: doc.total != null ? Number(doc.total) : undefined,
        },
      ],
    };

    if (options?.dryRun || !creds.accessToken) {
      return {
        status: 'dry_run',
        message: creds.accessToken
          ? 'dryRun=true'
          : 'Sem access_token — complete OAuth em Definições. Payload preparado:',
        payload,
        documentId: doc.id,
      };
    }

    const apiBase = String(creds.apiUrl).replace(/\/$/, '');
    const url = `${apiBase}/api/v1/commercial_purchases_documents`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/vnd.api+json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.warn(`TOConline push failed: ${res.status}`, data);
        return {
          status: 'error',
          httpStatus: res.status,
          error: data,
          payload,
        };
      }

      await this.prisma.integration.update({
        where: { id: int.id },
        data: { lastSyncAt: new Date() },
      });

      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action: 'import' as any,
          entityType: 'toconline_push',
          entityId: documentId,
          metadata: { response: data, external_reference: payload.external_reference },
        },
      });

      return { status: 'ok', response: data, documentId: doc.id };
    } catch (err: any) {
      this.logger.error('TOConline network error', err?.message);
      return {
        status: 'error',
        message: err?.message || 'Erro de rede',
        payload,
      };
    }
  }

  async pushMany(tenantId: string, documentIds: string[], dryRun = false) {
    const results = [];
    for (const id of documentIds) {
      results.push(await this.pushPurchaseDocument(tenantId, id, { dryRun }));
    }
    return {
      total: results.length,
      ok: results.filter((r) => r.status === 'ok').length,
      dryRun: results.filter((r) => r.status === 'dry_run').length,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    };
  }
}
