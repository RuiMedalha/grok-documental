import { Module } from '@nestjs/common';
import { FolderRulesService } from './folder-rules.service';
import { FolderRulesController } from './folder-rules.controller';

@Module({
  controllers: [FolderRulesController],
  providers: [FolderRulesService],
  exports: [FolderRulesService],
})
export class FolderRulesModule {}
