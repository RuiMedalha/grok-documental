import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TenantsService } from './tenants.service';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private tenants: TenantsService) {}

  @Get('me')
  me(@CurrentUser() user: any) {
    return this.tenants.get(user.tenantId);
  }

  @Patch('me')
  update(@CurrentUser() user: any, @Body() body: any) {
    return this.tenants.updateSettings(user.tenantId, body);
  }
}
