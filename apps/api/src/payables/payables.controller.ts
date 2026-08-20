import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PayablesService } from './payables.service';

@ApiTags('payables')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payables')
export class PayablesController {
  constructor(private payables: PayablesService) {}

  @Get()
  list(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('partyId') partyId?: string,
  ) {
    return this.payables.list(user.tenantId, { status, partyId });
  }

  @Get('summary')
  summary(@CurrentUser() user: any) {
    return this.payables.summary(user.tenantId);
  }

  @Get('export/sepa')
  async exportSepa(
    @CurrentUser() user: any,
    @Query('format') format: 'csv' | 'xml' = 'csv',
    @Query('status') status: string = 'to_pay',
    @Res() res: Response,
  ) {
    const result = await this.payables.exportSepa(user.tenantId, { format, status });
    if (result.format === 'xml') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sepa-pagamentos-${Date.now()}.xml"`,
      );
    } else {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="sepa-pagamentos-${Date.now()}.csv"`,
      );
    }
    res.send(result.content);
  }

  @Patch(':id/pay')
  markPaid(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.payables.markPaid(user.tenantId, user.sub, id, body);
  }
}
