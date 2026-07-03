import { Body, Controller, Param, Post, Req, UseFilters } from '@nestjs/common';
import type { RequestWithUser } from '../auth/request-with-user';
import { Roles } from '../auth/roles.decorator';
import { ApprovalService, type ApprovalResult } from './approval.service';
import { ApproveRequestPipe, type ApproveRequestDto } from './approve-request.dto';
import { DomainExceptionFilter } from './domain-exception.filter';

@Controller('meeting-requests')
@UseFilters(DomainExceptionFilter)
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Post(':requestId/approve')
  @Roles('BOSS')
  approve(
    @Param('requestId') requestId: string,
    @Body(ApproveRequestPipe) body: ApproveRequestDto,
    @Req() request: RequestWithUser,
  ): Promise<ApprovalResult> {
    // AuthenticationGuard guarantees user presence before protected controllers run.
    return this.approvals.approve(requestId, body.expectedVersion, request.user!);
  }

  @Post(':requestId/reject')
  @Roles('BOSS')
  reject(
    @Param('requestId') requestId: string,
    @Body(ApproveRequestPipe) body: ApproveRequestDto,
    @Req() request: RequestWithUser,
  ) {
    return this.approvals.reject(requestId, body.expectedVersion, request.user!);
  }
}
