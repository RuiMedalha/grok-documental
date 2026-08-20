import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { BankService } from './bank.service';
import {
  CreateCsvTemplateDto,
  PreviewCsvDto,
  ImportCsvDto,
  BankTransactionQueryDto,
} from './dto/bank.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('bank')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bank')
export class BankController {
  constructor(private bankService: BankService) {}

  // ── Templates ──────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'List CSV templates for tenant' })
  listTemplates(@CurrentUser() user: any) {
    return this.bankService.listTemplates(user.tenantId);
  }

  @Post('templates')
  @ApiOperation({ summary: 'Create CSV mapping template' })
  createTemplate(@CurrentUser() user: any, @Body() dto: CreateCsvTemplateDto) {
    return this.bankService.createTemplate(user.tenantId, dto);
  }

  @Delete('templates/:id')
  @ApiOperation({ summary: 'Delete CSV template' })
  deleteTemplate(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bankService.deleteTemplate(user.tenantId, id);
  }

  // ── Wizard: detect headers ─────────────────────────────────

  @Post('csv/headers')
  @ApiOperation({ summary: 'Detect CSV headers (wizard step 1)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  detectHeaders(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Ficheiro CSV obrigatório');
    const content = file.buffer.toString('utf-8');
    const firstLine = content.split(/\r?\n/).find((l) => l.trim()) || '';
    const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
    const headers = firstLine.split(delimiter).map((h) => h.replace(/^"|"$/g, '').trim());
    return { headers, delimiter, sampleLines: content.split(/\r?\n/).slice(0, 6) };
  }

  // ── Wizard: preview ────────────────────────────────────────

  @Post('csv/preview')
  @ApiOperation({ summary: 'Preview mapped CSV rows (wizard step 2)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  preview(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    if (!file) throw new BadRequestException('Ficheiro CSV obrigatório');
    const content = file.buffer.toString('utf-8');

    // mapping comes as JSON string in multipart
    const mapping = typeof body.mapping === 'string' ? JSON.parse(body.mapping) : body.mapping;
    const dto: PreviewCsvDto = {
      mapping,
      dateFormat: body.dateFormat || 'DD/MM/YYYY',
      decimalSep: body.decimalSep || ',',
      thousandSep: body.thousandSep || '.',
      hasHeader: body.hasHeader !== 'false' && body.hasHeader !== false,
    };

    return this.bankService.previewCsv(content, dto);
  }

  // ── Import ─────────────────────────────────────────────────

  @Post('csv/import')
  @ApiOperation({ summary: 'Import CSV bank transactions' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  import(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ) {
    if (!file) throw new BadRequestException('Ficheiro CSV obrigatório');
    const content = file.buffer.toString('utf-8');

    const mapping = typeof body.mapping === 'string' ? JSON.parse(body.mapping) : body.mapping;
    const dto: ImportCsvDto = {
      mapping,
      dateFormat: body.dateFormat || 'DD/MM/YYYY',
      decimalSep: body.decimalSep || ',',
      thousandSep: body.thousandSep || '.',
      hasHeader: body.hasHeader !== 'false' && body.hasHeader !== false,
      saveAsTemplate: body.saveAsTemplate || undefined,
    };

    return this.bankService.importCsv(user.tenantId, user.id, content, dto);
  }

  // ── Transactions ───────────────────────────────────────────

  @Get('transactions')
  @ApiOperation({ summary: 'List bank transactions' })
  listTransactions(@CurrentUser() user: any, @Query() query: BankTransactionQueryDto) {
    return this.bankService.listTransactions(user.tenantId, query);
  }


  @Get('transactions/export')
  @ApiOperation({ summary: 'Export bank transactions to Excel-compatible CSV' })
  async exportTransactions(
    @CurrentUser() user: any,
    @Query() query: BankTransactionQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.bankService.exportCsv(user.tenantId, {
      from: query.from,
      to: query.to,
      search: query.search,
    });
    const filename = `movimentos-bancarios-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(csv);
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Get bank transaction' })
  getTransaction(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bankService.getTransaction(user.tenantId, id);
  }
}
