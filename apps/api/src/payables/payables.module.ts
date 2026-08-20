import { Module } from '@nestjs/common';
import { PayablesService } from './payables.service';
import { PayablesController } from './payables.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [PayablesService],
  controllers: [PayablesController],
  exports: [PayablesService],
})
export class PayablesModule {}
