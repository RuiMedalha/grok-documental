import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [AccountingService],
  controllers: [AccountingController],
  exports: [AccountingService],
})
export class AccountingModule {}
