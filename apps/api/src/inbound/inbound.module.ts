import { Module, forwardRef } from '@nestjs/common';
import { InboundService } from './inbound.service';
import { InboundController } from './inbound.controller';
import { MailSyncService } from './mail-sync.service';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [forwardRef(() => DocumentsModule)],
  providers: [InboundService, MailSyncService],
  controllers: [InboundController],
  exports: [InboundService, MailSyncService],
})
export class InboundModule {}
