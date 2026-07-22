import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ApprovalMeetingMode, AuthenticatedUser, MeetingRequest, OutboxMessage, ScheduleBlock } from '../../domain/model';
import { DomainError } from '../../domain/domain-error';
import { APPROVAL_REPOSITORY, type ApprovalRepository } from './approval.repository';
import { BossIdentityService } from '../auth/boss-identity.service';
import { DatabaseService } from '../database/database.service';
import { WeComMeetingRoomService, type WeComRoomBooking } from '../wecom-meeting-room/wecom-meeting-room.service';

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
    private readonly database: DatabaseService,
    @Optional() private readonly wecomMeetingRooms?: WeComMeetingRoomService,
  ) {}

  async approve(requestId: string, expectedVersion: number, actor: AuthenticatedUser, meetingMode: ApprovalMeetingMode = 'FACE_TO_FACE'): Promise<ApprovalResult> {
    this.bossIdentity.assertOnlyBoss(actor);
    let wecomBooking: WeComRoomBooking | null = null;
    try {
    const result = await this.repository.transaction(async (tx) => {
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

      wecomBooking = await this.bookApprovedRequestRoom(candidate, actor);

      const schedule: ScheduleBlock = {
        id: randomUUID(), bossUserId: candidate.bossUserId, roomId: candidate.roomId,
        sourceType: 'APPROVED_REQUEST', sourceId: candidate.id, title: candidate.title,
        startAt: candidate.startAt, endAt: candidate.endAt,
        visibility: candidate.visibility, status: 'ACTIVE', approvalMeetingMode: meetingMode,
        wecomMeetingId:wecomBooking?.meetingId,
        wecomScheduleId:wecomBooking?.scheduleId,
      };
      await tx.insertSchedule(schedule);

      const now = new Date();
      Object.assign(candidate, { status: 'APPROVED', decisionBy: actor.id, decisionAt: now,
        approvedScheduleId: schedule.id, approvalMeetingMode: meetingMode, version: candidate.version + 1 });
      await tx.saveRequest(candidate);

      const competing = await tx.findOverlappingPending(
        candidate.bossUserId, candidate.startAt, candidate.endAt, candidate.id,
      );
      const messages: OutboxMessage[] = [{
        id: randomUUID(), type: 'REQUEST_APPROVED', aggregateId: candidate.id,
        recipientUserId: candidate.applicantUserId, dedupeKey: `request:${candidate.id}:approved`, payload: { meetingMode },
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
    await this.audit(actor, 'APPROVE_MEETING_REQUEST', 'meeting_request', requestId, null, {
      scheduleId: result.schedule.id,
      autoRejectedIds: result.autoRejectedIds,
      meetingMode,
      wecomMeetingId:result.schedule.wecomMeetingId ?? null,
    });
    return result;
    } catch (error) {
      const bookingToCancel = wecomBooking as WeComRoomBooking | null;
      if (bookingToCancel) {
        await this.wecomMeetingRooms?.cancelBooking(bookingToCancel.meetingId).catch((cancelError:unknown) => {
          console.error('[wecom-meeting-room] rollback cancel failed', cancelError);
        });
      }
      throw error;
    }
  }

  async reject(requestId: string, expectedVersion: number, actor: AuthenticatedUser): Promise<MeetingRequest> {
    this.bossIdentity.assertOnlyBoss(actor);
    const result = await this.repository.transaction(async (tx) => {
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
    await this.audit(actor, 'REJECT_MEETING_REQUEST', 'meeting_request', requestId, null, { status:'REJECTED' });
    return result;
  }

  private async audit(actor:AuthenticatedUser, action:string, entityType:string, entityId:string, beforeData:unknown, afterData:unknown):Promise<void> {
    await this.database.query(
      `INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,before_data,after_data)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actor.id,action,entityType,entityId,JSON.stringify(beforeData ?? null),JSON.stringify(afterData ?? null)],
    );
  }

  private async bookApprovedRequestRoom(candidate:MeetingRequest, actor:AuthenticatedUser): Promise<WeComRoomBooking | null> {
    if (!this.wecomMeetingRooms?.isConfigured()) return null;
    const context = await this.database.query<{ wecom_meetingroom_id:string | number | null; applicant_wecom_user_id:string | null }>(
      `SELECT r.wecom_meetingroom_id, u.wecom_user_id applicant_wecom_user_id
       FROM meeting_rooms r
       LEFT JOIN app_users u ON u.id=$2
       WHERE r.id=$1 AND r.enabled`,
      [candidate.roomId,candidate.applicantUserId],
    );
    const row = context.rows[0];
    const meetingroomId = Number(row?.wecom_meetingroom_id);
    if (!Number.isFinite(meetingroomId) || meetingroomId <= 0) return null;
    return this.wecomMeetingRooms.bookRoom({
      meetingroomId,
      subject:candidate.title,
      startAt:candidate.startAt,
      endAt:candidate.endAt,
      booker:actor.wecomUserId,
      attendees:row?.applicant_wecom_user_id ? [row.applicant_wecom_user_id] : [],
    });
  }
}
