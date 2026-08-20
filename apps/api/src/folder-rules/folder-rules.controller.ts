import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FolderRulesService } from './folder-rules.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('folder-rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('folder-rules')
export class FolderRulesController {
  constructor(private folderRulesService: FolderRulesService) {}

  @Get()
  @ApiOperation({ summary: 'List folder rules' })
  list(@CurrentUser() user: any) {
    return this.folderRulesService.list(user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create folder rule' })
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.folderRulesService.create(user.tenantId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update folder rule' })
  update(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: any,
  ) {
    return this.folderRulesService.update(user.tenantId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete folder rule' })
  delete(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.folderRulesService.delete(user.tenantId, id);
  }
}
