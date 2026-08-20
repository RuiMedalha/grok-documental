import { Module } from '@nestjs/common';
import { PartiesService } from './parties.service';
import { PartiesController } from './parties.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [PartiesService],
  controllers: [PartiesController],
  exports: [PartiesService],
})
export class PartiesModule {}
