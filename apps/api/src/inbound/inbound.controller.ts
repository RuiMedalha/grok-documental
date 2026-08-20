import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { InboundService } from './inbound.service';
import { MailSyncService } from './mail-sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

const uploadOpts = {
  storage: memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
};

@ApiTags('inbound')
@Controller('inbound')
export class InboundController {
  constructor(
    private inbound: InboundService,
    private mailSync: MailSyncService,
  ) {}

  @Get('scan-config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter URL/token para scanner e MFP' })
  async getConfig(@CurrentUser() user: any, @Req() req: any) {
    const tenant = await this.inbound.ensureScanToken(user.tenantId);
    const base =
      process.env.PUBLIC_API_URL ||
      `${req.protocol}://${req.get('host')}/api`;
    return {
      scanToken: tenant.scanToken,
      scanEmail: tenant.scanEmail,
      dropUrl: `${base}/inbound/scan/${tenant.scanToken}`,
      instructions: {
        mfp_email:
          'Configure a multifunções para "Scan to Email" para o endereço scan configurado, com a fatura em anexo (PDF/JPG).',
        mfp_folder:
          'Scan to Network Folder + script watcher (scripts/scan-folder-watcher.js) que faz POST para dropUrl.',
        curl: `curl -X POST "${base}/inbound/scan/${tenant.scanToken}" -F "file=@documento.pdf"`,
      },
    };
  }

  @Post('scan-config/regenerate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Regenerar token de scanner' })
  regenerate(@CurrentUser() user: any) {
    return this.inbound.regenerateScanToken(user.tenantId);
  }

  @Post('scan/:token')
  @ApiOperation({ summary: 'Receber ficheiro do scanner / MFP / agente' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', uploadOpts))
  upload(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.inbound.ingestFile(token, file);
  }

  @Post('email')
  @ApiOperation({
    summary: 'Webhook email inbound (SendGrid/Mailgun) — anexos → Inbox',
  })
  @UseInterceptors(AnyFilesInterceptor(uploadOpts))
  email(
    @Body() body: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const to = body.to || body.recipient || body.envelope?.to;
    const from = body.from || body.sender;
    const token = body.token || body.scanToken;
    return this.inbound.ingestEmail({
      to,
      from,
      subject: body.subject,
      text: body.text || body['body-plain'] || body.plain || body.TextBody,
      html: body.html || body['body-html'] || body.HtmlBody,
      token,
      files: files || [],
    });
  }

  @Post('from-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Importar fatura a partir de URL (link Moloni/TOConline/email)' })
  fromUrl(@CurrentUser() user: any, @Body() body: { url: string }) {
    return this.inbound.ingestUrl(user.tenantId, body.url);
  }

  @Post('mail/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Guardar IMAP da caixa de faturas (automático)' })
  saveMail(@CurrentUser() user: any, @Body() body: any) {
    return this.mailSync.saveImapConfig(user.tenantId, body);
  }

  @Get('mail/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ver config IMAP (sem password)' })
  async getMail(@CurrentUser() user: any) {
    const cfg = await this.mailSync.getImapConfig(user.tenantId);
    if (!cfg) return { configured: false };
    return {
      configured: true,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      user: cfg.user,
      mailbox: cfg.mailbox || 'INBOX',
      markSeen: cfg.markSeen !== false,
      passSet: !!cfg.pass,
    };
  }

  @Post('mail/sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sincronizar agora: emails → Inbox (anexos + links)' })
  syncMail(@CurrentUser() user: any) {
    return this.mailSync.syncTenant(user.tenantId);
  }

  /** Cron externo: Authorization: Bearer CRON_SECRET */
  @Post('mail/sync-all')
  @ApiOperation({ summary: 'Cron: sync IMAP de todos os tenants' })
  async syncAll(@Req() req: any) {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers['x-cron-secret'] !== secret) {
      return { ok: false, error: 'Unauthorized' };
    }
    return this.mailSync.syncAll();
  }
}
