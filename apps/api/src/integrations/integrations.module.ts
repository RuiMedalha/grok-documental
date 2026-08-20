import { Module } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { ToconlineService } from './toconline.service';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, ToconlineService],
  exports: [IntegrationsService, ToconlineService],
})
export class IntegrationsModule {}
