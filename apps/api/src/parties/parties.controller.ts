import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PartiesService } from './parties.service';

@ApiTags('parties')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('parties')
export class PartiesController {
  constructor(private parties: PartiesService) {}

  @Get()
  list(
    @CurrentUser() user: any,
    @Query('type') type?: string,
    @Query('search') search?: string,
  ) {
    return this.parties.list(user.tenantId, { type, search });
  }

  @Get(':id')
  get(@CurrentUser() user: any, @Param('id') id: string) {
    return this.parties.get(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() body: any) {
    return this.parties.create(user.tenantId, user.sub, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: any) {
    return this.parties.update(user.tenantId, user.sub, id, body);
  }

  @Post('from-crm')
  fromCrm(
    @CurrentUser() user: any,
    @Body() body: { provider: string; rows: any[] },
  ) {
    return this.parties.upsertFromCrm(
      user.tenantId,
      user.sub,
      body.rows || [],
      body.provider || 'crm',
    );
  }
}
