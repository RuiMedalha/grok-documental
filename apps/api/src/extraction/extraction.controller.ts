import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ExtractionService } from './extraction.service';

@ApiTags('extraction')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('extraction')
export class ExtractionController {
  constructor(private extraction: ExtractionService) {}

  @Post('documents/:id')
  extract(@CurrentUser() user: any, @Param('id') id: string) {
    return this.extraction.processDocument(user.tenantId, user.sub, id);
  }

  /** Aplicar payload lido do QR Code AT (câmara ou scanner) */
  @Post('documents/:id/at-qr')
  atQr(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { qrText: string },
  ) {
    return this.extraction.applyAtQrPayload(
      user.tenantId,
      user.sub,
      id,
      body.qrText || '',
    );
  }

  /** Só fazer parse (pré-visualização, sem gravar) */
  @Post('at-qr/parse')
  parseOnly(@Body() body: { qrText: string }) {
    const { parseAtQr, atQrToDocumentFields } = require('./at-qr.parser');
    const at = parseAtQr(body.qrText || '');
    if (!at) return { valid: false };
    return { valid: true, atQr: at, fields: atQrToDocumentFields(at) };
  }
}
