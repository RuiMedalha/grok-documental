import { Module } from '@nestjs/common';
import { ExtractionService } from './extraction.service';
import { ExtractionController } from './extraction.controller';
import { PartiesModule } from '../parties/parties.module';

@Module({
  imports: [PartiesModule],
  providers: [ExtractionService],
  controllers: [ExtractionController],
  exports: [ExtractionService],
})
export class ExtractionModule {}
