import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser, MeetingRequest, OutboxMessage, ScheduleBlock } from '../../domain/model';
import { DomainError } from '../../domain/domain-error';
import { APPROVAL_REPOSITORY, type ApprovalRepository } from './approval.repository';
import { BossIdentityService } from '../auth/boss-identity.service';

export interface ApprovalResult {
  approved: MeetingRequest;
  schedule: ScheduleBlock;
  autoRejectedIds: string[];
}

@Injectable()
export class ApprovalService {
  constructor(
    @Inject(APPROVAL_REPOSITORY) private readonly repository: ApprovalRepository,
    private readonly bossIdentity: BossIdentityService,
  ) {}

  async approve(requestId: string, expectedVersion: number, actor: AuthenticatedUser): Promise<ApprovalResult> {
    this.bossIdentity.assertOnlyBoss(actor);
    return this.repository.transaction(async (tx) => {
      const candidate = await tx.lockRequest(requestId);
      if (!candidate) throw new DomainError('REQUEST_NOT_FOUND', '申请不存在');
      this.bossIdentity.assertRequestTargetsBoss(candidate.bossUserId, actor);
      if (candidate.status !== 'PENDING') throw new DomainError('REQUEST_STATE_CHANGED', '申请已被处理');
      if (candidate.version !== expectedVersion) throw new DomainError('VERSION_CONFLICT', '申请版本已变化');
      if (!Number.isFinite(candidate.startAt.getTime()) || !Number.isFinite(candidate.endAt.getTime()) ||
          candidate.startAt >= candidate.endAt) {
        throw new DomainError('INVALID_TIME_RANGE', '开始时间必须早于结束时间');
      }

      await tx.lockBossAndRoom(candidate.bossUserId, candidate.roomId);
      if (await tx.findActiveBossConflict(candidate.bossUserId, candidate.startAt, candidate.endAt)) {
        throw new DomainError('BOSS_SCHEDULE_CONFLICT', '石总该时段已有生效行程');
      }
      if (await tx.findActiveRoomConflict(candidate.roomId, candidate.startAt, candidate.endAt)) {
        throw new DomainError('ROOM_CONFLICT', '会议室该时段已被占用');
      }

      const schedule: ScheduleBlock = {
        id: randomUUID(), bossUserId: candidate.bossUserId, roomId: candidate.roomId,
        sourceType: 'REQUEST', sourceId: candidate.id, title: candidate.title,
        startAt: candidate.startAt, endAt: candidate.endAt,
        visibility: candidate.visibility, status: 'ACTIVE',
      };
      await tx.insertSchedule(schedule);

      const now = new Date();
      Object.assign(candidate, { status: 'APPROVED', decisionBy: actor.id, decisionAt: now,
        approvedScheduleId: schedule.id, version: candidate.version + 1 });
      await tx.saveRequest(candidate);

      const competing = await tx.findOverlappingPending(
        candidate.bossUserId, candidate.startAt, candidate.endAt, candidate.id,
      );
      const messages: OutboxMessage[] = [{
        id: randomUUID(), type: 'REQUEST_APPROVED', aggregateId: candidate.id,
        recipientUserId: candidate.applicantUserId, dedupeKey: `request:${candidate.id}:approved`, payload: {},
      }];
      for (const request of competing) {
        Object.assign(request, { status: 'REJECTED', rejectionSource: 'OVERLAP_AUTO',
          decisionBy: actor.id, decisionAt: now, version: request.version + 1 });
        await tx.saveRequest(request);
        messages.push({ id: randomUUID(), type: 'REQUEST_AUTO_REJECTED', aggregateId: request.id,
          recipientUserId: request.applicantUserId, dedupeKey: `request:${request.id}:overlap-rejected`,
          payload: { approvedTimeOccupied: true } });
      }
      await tx.enqueue(messages);
      return { approved: candidate, schedule, autoRejectedIds: competing.map(({ id }) => id) };
    });
  }

  async reject(requestId: string, expectedVersion: number, actor: AuthenticatedUser): Promise<MeetingRequest> {
    this.bossIdentity.assertOnlyBoss(actor);
    return this.repository.transaction(async (tx) => {
      const candidate = await tx.lockRequest(requestId);
      if (!candidate) throw new DomainError('REQUEST_NOT_FOUND', '申请不存在');
      this.bossIdentity.assertRequestTargetsBoss(candidate.bossUserId, actor);
      if (candidate.status !== 'PENDING') throw new DomainError('REQUEST_STATE_CHANGED', '申请已被处理');
      if (candidate.version !== expectedVersion) throw new DomainError('VERSION_CONFLICT', '申请版本已变化');

      Object.assign(candidate, {
        status: 'REJECTED', rejectionSource: 'MANUAL', decisionBy: actor.id,
        decisionAt: new Date(), version: candidate.version + 1,
      });
      await tx.saveRequest(candidate);
      await tx.enqueue([{
        id: randomUUID(), type: 'REQUEST_REJECTED', aggregateId: candidate.id,
        recipientUserId: candidate.applicantUserId,
        dedupeKey: `request:${candidate.id}:rejected`, payload: {},
      }]);
      return candidate;
    });
  }
}
