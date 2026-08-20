import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AccountingService } from './accounting.service';

@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private accounting: AccountingService) {}

  @Get('accounts')
  listAccounts(@CurrentUser() user: any) {
    return this.accounting.listAccounts(user.tenantId);
  }

  @Post('accounts/seed')
  seed(@CurrentUser() user: any) {
    return this.accounting.seedDefaults(user.tenantId);
  }

  @Post('accounts')
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.accounting.createAccount(user.tenantId, body);
  }

  @Post('documents/:id/classify')
  classify(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.accounting.classifyDocument(user.tenantId, user.sub, id, body);
  }

  @Get('documents/:id/journal')
  journal(@CurrentUser() user: any, @Param('id') id: string) {
    return this.accounting.getDocumentJournal(user.tenantId, id);
  }
}
