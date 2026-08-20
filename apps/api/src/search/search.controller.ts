import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SearchService } from './search.service';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private search: SearchService) {}

  @Get()
  query(
    @CurrentUser() user: any,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.search.search(user.tenantId, q || '', limit ? parseInt(limit, 10) : 8);
  }
}
