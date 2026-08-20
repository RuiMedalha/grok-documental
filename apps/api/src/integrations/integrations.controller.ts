import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List integrations for tenant' })
  list(@CurrentUser() user: any) {
    return this.integrationsService.list(user.tenantId);
  }

  @Post(':provider')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configure integration credentials' })
  upsert(
    @CurrentUser() user: any,
    @Param('provider') provider: string,
    @Body() body: { credentials: Record<string, any> },
  ) {
    return this.integrationsService.upsert(
      user.tenantId,
      provider,
      body.credentials || body,
    );
  }

  @Post(':provider/deactivate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate integration' })
  deactivate(@CurrentUser() user: any, @Param('provider') provider: string) {
    return this.integrationsService.deactivate(user.tenantId, provider);
  }

  @Post('woocommerce/sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync WooCommerce orders (stub)' })
  syncWoo(@CurrentUser() user: any) {
    return this.integrationsService.syncWooCommerceOrders(user.tenantId);
  }

  @Post('moloni/sync')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync Moloni invoices (stub)' })
  syncMoloni(@CurrentUser() user: any) {
    return this.integrationsService.syncMoloniInvoices(user.tenantId);
  }

  @Post('ifthenpay/callback')
  @ApiOperation({ summary: 'Ifthenpay payment callback/webhook' })
  ifthenpayCallback(
    @Query('tenantId') tenantId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const tid = tenantId || body?.tenantId || null;
    return this.integrationsService.handleIfthenpayCallback(tid, body || req.query);
  }

  // ── TOConline ──────────────────────────────────────────────

  @Get('toconline/config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get TOConline integration status (no secrets)' })
  toconlineConfig(@CurrentUser() user: any) {
    return this.integrationsService.getToconlineConfig(user.tenantId);
  }

  @Get('toconline/authorize-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get OAuth authorize URL for TOConline' })
  toconlineAuthUrl(
    @CurrentUser() user: any,
    @Query('redirectUri') redirectUri: string,
  ) {
    return this.integrationsService.getToconlineAuthorizeUrl(
      user.tenantId,
      redirectUri || 'http://localhost:3000/settings',
    );
  }

  @Post('toconline/exchange-code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Exchange OAuth code for TOConline tokens' })
  toconlineExchange(@CurrentUser() user: any, @Body() body: { code: string }) {
    return this.integrationsService.exchangeToconlineCode(user.tenantId, body.code);
  }

  @Post('toconline/push/:documentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Push document to TOConline as purchase document' })
  toconlinePush(
    @CurrentUser() user: any,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.integrationsService.pushToToconline(
      user.tenantId,
      documentId,
      dryRun === 'true' || dryRun === '1',
    );
  }

  @Post('toconline/push-batch')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Push multiple documents to TOConline' })
  toconlinePushBatch(
    @CurrentUser() user: any,
    @Body() body: { documentIds: string[]; dryRun?: boolean },
  ) {
    return this.integrationsService.pushManyToToconline(
      user.tenantId,
      body.documentIds || [],
      !!body.dryRun,
    );
  }

  @Get(':provider/contacts')
  crmContacts(@CurrentUser() user: any, @Param('provider') provider: string) {
    return this.integrations.getCrmContacts(user.tenantId, provider);
  }
}
