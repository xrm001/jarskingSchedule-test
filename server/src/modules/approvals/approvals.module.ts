import { Module } from '@nestjs/common';
import { BossIdentityService } from '../auth/boss-identity.service';
import { ApprovalController } from './approval.controller';
import { APPROVAL_REPOSITORY } from './approval.repository';
import { ApprovalService } from './approval.service';
import { InMemoryApprovalRepository } from './in-memory-approval.repository';

/**
 * Runnable development wiring. Replace InMemoryApprovalRepository with a
 * PostgreSQL transaction adapter before production deployment.
 */
@Module({
  controllers: [ApprovalController],
  providers: [
    ApprovalService,
    BossIdentityService,
    { provide: APPROVAL_REPOSITORY, useClass: InMemoryApprovalRepository },
  ],
  exports: [ApprovalService, APPROVAL_REPOSITORY],
})
export class ApprovalsModule {}
