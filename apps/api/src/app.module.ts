import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DocumentsModule } from './documents/documents.module';
import { BankModule } from './bank/bank.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { FolderRulesModule } from './folder-rules/folder-rules.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PartiesModule } from './parties/parties.module';
import { AccountingModule } from './accounting/accounting.module';
import { PayablesModule } from './payables/payables.module';
import { ExtractionModule } from './extraction/extraction.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TenantsModule } from './tenants/tenants.module';
import { AuditModule } from './audit/audit.module';
import { SearchModule } from './search/search.module';
import { InboundModule } from './inbound/inbound.module';
import { HealthModule } from './health/health.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    AuditModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60') * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT || '100'),
      },
    ]),
    PrismaModule,
    AuthModule,
    DocumentsModule,
    BankModule,
    ReconciliationModule,
    FolderRulesModule,
    IntegrationsModule,
    PartiesModule,
    AccountingModule,
    PayablesModule,
    ExtractionModule,
    NotificationsModule,
    TenantsModule,
    SearchModule,
    InboundModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
