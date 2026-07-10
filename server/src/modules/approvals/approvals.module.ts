import { Module } from '@nestjs/common';
import { BossIdentityService } from '../auth/boss-identity.service';
import { ApprovalController } from './approval.controller';
import { APPROVAL_REPOSITORY } from './approval.repository';
import { ApprovalService } from './approval.service';
import { InMemoryApprovalRepository } from './in-memory-approval.repository';
import { PostgresApprovalRepository } from './postgres-approval.repository';
import { NotificationModule } from '../notifications/notification.module';
import { WeComMeetingRoomModule } from '../wecom-meeting-room/wecom-meeting-room.module';

/**
 * PostgreSQL is mandatory in production. Unit tests instantiate the in-memory
 * adapter directly and never pass through this module wiring.
 */
@Module({
  imports: [NotificationModule, WeComMeetingRoomModule],
  controllers: [ApprovalController],
  providers: [
    ApprovalService,
    BossIdentityService,
    PostgresApprovalRepository,
    InMemoryApprovalRepository,
    {
      provide: APPROVAL_REPOSITORY,
      useFactory: (postgres: PostgresApprovalRepository, memory: InMemoryApprovalRepository) =>
        process.env.DATABASE_URL ? postgres : memory,
      inject: [PostgresApprovalRepository, InMemoryApprovalRepository],
    },
  ],
  exports: [ApprovalService, APPROVAL_REPOSITORY],
})
export class ApprovalsModule {}
