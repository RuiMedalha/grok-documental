import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { DocumentsService } from './documents.service';
import { UpdateDocumentDto, DocumentQueryDto } from './dto/document.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DocumentOrigin } from '@prisma/client';
import { memoryStorage } from 'multer';

const ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload document to Inbox' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        origin: { type: 'string', enum: Object.values(DocumentOrigin) },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIMES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async upload(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('origin') origin?: DocumentOrigin,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.documentsService.upload(
      user.tenantId,
      user.id,
      file,
      origin || DocumentOrigin.upload,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List documents (with filters)' })
  async findAll(@CurrentUser() user: any, @Query() query: DocumentQueryDto) {
    return this.documentsService.findAll(user.tenantId, query);
  }

  @Get('inbox')
  @ApiOperation({ summary: 'List Inbox documents (status=novo)' })
  async inbox(@CurrentUser() user: any, @Query() query: DocumentQueryDto) {
    return this.documentsService.findInbox(user.tenantId, query);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export documents to Excel-compatible CSV' })
  async export(
    @CurrentUser() user: any,
    @Query() query: DocumentQueryDto,
    @Res() res: Response,
  ) {
    const csv = await this.documentsService.exportCsv(user.tenantId, {
      status: query.status,
      type: query.type,
      search: query.search,
    });
    const filename = `documentos-${new Date().toISOString().slice(0, 10)}.csv`;
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  async findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update document metadata' })
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(user.tenantId, user.id, id, dto);
  }

  @Get(':id/file')
  @ApiOperation({ summary: 'Get signed/download URL for file' })
  async getFileUrl(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.getFileUrl(user.tenantId, id);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download file' })
  async download(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType, fileName } = await this.documentsService.getFileBuffer(
      user.tenantId,
      id,
    );
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
