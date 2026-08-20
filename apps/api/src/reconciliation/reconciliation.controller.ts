import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReconciliationService } from './reconciliation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private reconciliationService: ReconciliationService) {}

  @Post('run')
  @ApiOperation({ summary: 'Run matching engine (job)' })
  run(@CurrentUser() user: any) {
    return this.reconciliationService.runMatching(user.tenantId, user.id);
  }

  @Get('suggestions')
  @ApiOperation({ summary: 'List match suggestions' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'accepted', 'rejected'] })
  listSuggestions(
    @CurrentUser() user: any,
    @Query('status') status?: string,
  ) {
    return this.reconciliationService.listSuggestions(
      user.tenantId,
      status || 'pending',
    );
  }

  @Post('suggestions/:id/accept')
  @ApiOperation({ summary: 'Accept a match suggestion' })
  accept(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reconciliationService.acceptSuggestion(user.tenantId, user.id, id);
  }

  @Post('suggestions/:id/reject')
  @ApiOperation({ summary: 'Reject a match suggestion' })
  reject(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reconciliationService.rejectSuggestion(user.tenantId, user.id, id);
  }

  @Post('expenses/from-document/:documentId')
  @ApiOperation({ summary: 'Create expense from document for reconciliation' })
  createExpense(
    @CurrentUser() user: any,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.reconciliationService.createExpenseFromDocument(
      user.tenantId,
      documentId,
    );
  }
}
