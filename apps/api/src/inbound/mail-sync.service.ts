import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InboundService } from './inbound.service';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface ImapConfig {
  host: string;
  port?: number;
  secure?: boolean;
  user: string;
  pass: string;
  mailbox?: string; // default INBOX
  markSeen?: boolean;
}

@Injectable()
export class MailSyncService {
  private readonly logger = new Logger(MailSyncService.name);

  constructor(
    private prisma: PrismaService,
    private inbound: InboundService,
  ) {}

  async getImapConfig(tenantId: string): Promise<ImapConfig | null> {
    const row = await this.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId, provider: 'imap_inbound' } },
    });
    if (!row?.isActive) return null;
    return row.credentials as unknown as ImapConfig;
  }

  async saveImapConfig(tenantId: string, config: ImapConfig) {
    if (!config.host || !config.user || !config.pass) {
      throw new BadRequestException('host, user e pass são obrigatórios');
    }
    return this.prisma.integration.upsert({
      where: { tenantId_provider: { tenantId, provider: 'imap_inbound' } },
      update: { credentials: config as any, isActive: true, lastSyncAt: null },
      create: {
        tenantId,
        provider: 'imap_inbound',
        credentials: config as any,
        isActive: true,
      },
    });
  }

  /**
   * Lê emails não lidos (ou recentes), processa anexos + links → Inbox.
   * Corre sob demanda ou por cron/scheduler.
   */
  async syncTenant(tenantId: string, opts: { limit?: number } = {}) {
    const config = await this.getImapConfig(tenantId);
    if (!config) {
      throw new BadRequestException(
        'IMAP não configurado. Definições → Email de faturas.',
      );
    }

    const tenant = await this.inbound.ensureScanToken(tenantId);
    const limit = opts.limit ?? 20;

    const client = new ImapFlow({
      host: config.host,
      port: config.port || (config.secure === false ? 143 : 993),
      secure: config.secure !== false,
      auth: { user: config.user, pass: config.pass },
      logger: false,
    });

    const processed: any[] = [];
    const errors: any[] = [];

    try {
      await client.connect();
      const mailbox = config.mailbox || 'INBOX';
      const lock = await client.getMailboxLock(mailbox);
      try {
        // UNSEEN first; if none, last N messages still unseen-only is safer
        const uids: number[] = [];
        for await (const msg of client.fetch(
          { seen: false },
          { source: true, uid: true, envelope: true },
        )) {
          uids.push(msg.uid);
          if (uids.length >= limit) break;

          try {
            const parsed = await simpleParser(msg.source as Buffer);
            const files: Express.Multer.File[] = [];

            for (const att of parsed.attachments || []) {
              const filename = att.filename || `anexo-${Date.now()}.bin`;
              const isUseful =
                /pdf|jpeg|jpg|png|webp/i.test(att.contentType || '') ||
                /\.(pdf|jpe?g|png)$/i.test(filename);
              if (!isUseful) continue;
              files.push({
                buffer: att.content,
                originalname: filename,
                mimetype: att.contentType || 'application/octet-stream',
                size: att.content.length,
                fieldname: 'file',
                encoding: '7bit',
              } as Express.Multer.File);
            }

            const result = await this.inbound.ingestEmail({
              to: config.user,
              from: parsed.from?.text,
              subject: parsed.subject,
              text: parsed.text || undefined,
              html: typeof parsed.html === 'string' ? parsed.html : undefined,
              token: tenant.scanToken!,
              files,
            });

            if (config.markSeen !== false) {
              await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
            }

            processed.push({
              uid: msg.uid,
              subject: parsed.subject,
              from: parsed.from?.text,
              result,
            });
          } catch (e: any) {
            this.logger.warn(`Email uid=${msg.uid} falhou: ${e.message}`);
            errors.push({ uid: msg.uid, error: e.message });
          }
        }
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (e: any) {
      this.logger.error(`IMAP sync failed: ${e.message}`);
      throw new BadRequestException(`IMAP: ${e.message}`);
    }

    await this.prisma.integration.update({
      where: { tenantId_provider: { tenantId, provider: 'imap_inbound' } },
      data: { lastSyncAt: new Date() },
    });

    return {
      ok: true,
      processed: processed.length,
      errors: errors.length,
      items: processed,
      errorDetails: errors,
    };
  }

  /** Sync all tenants with IMAP active (cron) */
  async syncAll() {
    const rows = await this.prisma.integration.findMany({
      where: { provider: 'imap_inbound', isActive: true },
    });
    const out = [];
    for (const r of rows) {
      try {
        out.push({
          tenantId: r.tenantId,
          ...(await this.syncTenant(r.tenantId)),
        });
      } catch (e: any) {
        out.push({ tenantId: r.tenantId, ok: false, error: e.message });
      }
    }
    return out;
  }
}
