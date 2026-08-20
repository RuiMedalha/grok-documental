import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { DocumentOrigin } from '@prisma/client';
import * as crypto from 'crypto';
import { pickInvoiceLinks } from './email-link.extractor';

@Injectable()
export class InboundService {
  private readonly logger = new Logger(InboundService.name);

  constructor(
    private prisma: PrismaService,
    private documents: DocumentsService,
  ) {}

  async ensureScanToken(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t) throw new NotFoundException('Tenant não encontrado');
    if (t.scanToken) return t;
    const scanToken = crypto.randomBytes(24).toString('hex');
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { scanToken },
    });
  }

  async regenerateScanToken(tenantId: string) {
    const scanToken = crypto.randomBytes(24).toString('hex');
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { scanToken },
    });
  }

  async resolveTenantByToken(token: string) {
    if (!token) throw new UnauthorizedException('Token em falta');
    const t = await this.prisma.tenant.findFirst({ where: { scanToken: token } });
    if (!t) throw new UnauthorizedException('Token de scanner inválido');
    return t;
  }

  async ingestFile(
    token: string,
    file: Express.Multer.File,
    meta: { filename?: string; from?: string; origin?: DocumentOrigin } = {},
  ) {
    const tenant = await this.resolveTenantByToken(token);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Ficheiro em falta');
    }

    const admin = await this.prisma.user.findFirst({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!admin) throw new BadRequestException('Tenant sem utilizadores');

    const originalname =
      meta.filename || file.originalname || `scan-${Date.now()}.pdf`;
    const multerLike = {
      ...file,
      originalname,
    } as Express.Multer.File;

    const doc = await this.documents.upload(
      tenant.id,
      admin.id,
      multerLike,
      meta.origin || DocumentOrigin.email,
    );

    this.logger.log(
      `Inbound file tenant=${tenant.slug} file=${originalname} doc=${doc.id}`,
    );
    return {
      ok: true,
      documentId: doc.id,
      fileName: doc.fileName,
      tenant: tenant.slug,
    };
  }

  /**
   * Descarrega PDF/imagem a partir de URL (link no email Moloni/TOConline/etc.)
   */
  async fetchRemoteDocument(
    tenantToken: string,
    url: string,
    meta: { from?: string; subject?: string } = {},
  ) {
    if (!url?.startsWith('http')) {
      throw new BadRequestException('URL inválida');
    }

    this.logger.log(`Fetching remote invoice: ${url.slice(0, 120)}`);

    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent':
          'DocFlowInbound/1.0 (+https://docflow.local; invoice-fetch)',
        Accept: 'application/pdf,image/*,*/*',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      throw new BadRequestException(
        `Falha ao descarregar link (${res.status}): ${url.slice(0, 80)}`,
      );
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());

    // Se HTML (página de visualização), tentar extrair link direto para PDF
    if (contentType.includes('text/html') || looksLikeHtml(buf)) {
      const html = buf.toString('utf8');
      const nested = pickInvoiceLinks(html, 5).filter((u) =>
        /\.pdf|download|pdf/i.test(u),
      );
      if (nested[0] && nested[0] !== url) {
        return this.fetchRemoteDocument(tenantToken, nested[0], meta);
      }
      throw new BadRequestException(
        'O link abriu uma página HTML sem PDF direto. Pode exigir login no Moloni/TOConline — use anexo ou API.',
      );
    }

    let ext = '.pdf';
    let mime = 'application/pdf';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) {
      ext = '.jpg';
      mime = 'image/jpeg';
    } else if (contentType.includes('png')) {
      ext = '.png';
      mime = 'image/png';
    } else if (!contentType.includes('pdf') && buf.slice(0, 4).toString() === '%PDF') {
      ext = '.pdf';
      mime = 'application/pdf';
    }

    const nameFromUrl = url.split('?')[0].split('/').pop() || `fatura${ext}`;
    const filename = nameFromUrl.includes('.')
      ? nameFromUrl
      : `fatura-email-${Date.now()}${ext}`;

    const file = {
      buffer: buf,
      originalname: filename,
      mimetype: mime,
      size: buf.length,
      fieldname: 'file',
      encoding: '7bit',
    } as Express.Multer.File;

    return this.ingestFile(tenantToken, file, {
      filename,
      from: meta.from,
      origin: DocumentOrigin.email,
    });
  }

  /**
   * Email inbound: anexos + links no corpo (Moloni, TOConline, etc.)
   */
  async ingestEmail(payload: {
    to?: string;
    from?: string;
    subject?: string;
    text?: string;
    html?: string;
    token?: string;
    files?: Express.Multer.File[];
  }) {
    let tenant = null as any;

    if (payload.token) {
      tenant = await this.resolveTenantByToken(payload.token);
    } else if (payload.to) {
      const to = String(payload.to).toLowerCase();
      const emailMatch = await this.prisma.tenant.findFirst({
        where: { scanEmail: { equals: to, mode: 'insensitive' } },
      });
      if (emailMatch) tenant = emailMatch;
      else {
        const local = to.split('@')[0] || '';
        const tokenPart = local.includes('+') ? local.split('+')[1] : local;
        if (tokenPart) {
          tenant = await this.prisma.tenant.findFirst({
            where: { scanToken: tokenPart },
          });
        }
      }
    }

    if (!tenant?.scanToken) {
      throw new UnauthorizedException(
        'Não foi possível identificar o tenant (token ou email de scan)',
      );
    }

    const results: any[] = [];
    const files = (payload.files || []).filter((f) => f?.buffer?.length);

    // 1) Anexos diretos
    for (const file of files) {
      results.push(
        await this.ingestFile(tenant.scanToken, file, {
          filename: file.originalname,
          from: payload.from,
          origin: DocumentOrigin.email,
        }),
      );
    }

    // 2) Links no corpo (quando não há anexo — típico Moloni/TOConline)
    if (!results.length) {
      const body = [payload.html, payload.text, payload.subject]
        .filter(Boolean)
        .join('\n');
      const links = pickInvoiceLinks(body, 3);
      this.logger.log(`Email links candidates: ${links.length}`);

      for (const link of links) {
        try {
          const r = await this.fetchRemoteDocument(tenant.scanToken, link, {
            from: payload.from,
            subject: payload.subject,
          });
          results.push({ ...r, sourceUrl: link });
        } catch (e: any) {
          this.logger.warn(`Link fetch failed ${link}: ${e.message}`);
          results.push({ ok: false, sourceUrl: link, error: e.message });
        }
      }
    }

    if (!results.length) {
      throw new BadRequestException(
        'Email sem anexos e sem links de fatura utilizáveis',
      );
    }

    return {
      ok: results.some((r) => r.ok),
      count: results.filter((r) => r.ok).length,
      documents: results,
      from: payload.from,
      subject: payload.subject,
    };
  }

  /** Manual: utilizador cola URL da fatura */
  async ingestUrl(tenantId: string, url: string) {
    const tenant = await this.ensureScanToken(tenantId);
    return this.fetchRemoteDocument(tenant.scanToken!, url);
  }
}

function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.slice(0, 200).toString('utf8').toLowerCase();
  return head.includes('<html') || head.includes('<!doctype');
}
