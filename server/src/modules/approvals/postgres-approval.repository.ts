import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';
import { DomainError } from '../../domain/domain-error';
import type { MeetingRequest, OutboxMessage, ScheduleBlock } from '../../domain/model';
import { DatabaseService } from '../database/database.service';
import type { ApprovalRepository, ApprovalTransaction } from './approval.repository';

interface RequestRow extends QueryResultRow {
  id:string; boss_user_id:string; applicant_user_id:string; room_id:string | null;
  topic:string; start_at:Date; end_at:Date; visibility:MeetingRequest['visibility'];
  status:MeetingRequest['status']; version:number; decided_by:string | null;
  decided_at:Date | null; rejection_source:MeetingRequest['rejectionSource'] | null;
  approved_schedule_id:string | null; approval_meeting_mode:MeetingRequest['approvalMeetingMode'] | null;
}

interface ScheduleRow extends QueryResultRow {
  id:string; boss_user_id:string; room_id:string | null; source_type:ScheduleBlock['sourceType'];
  source_id:string | null; title:string | null; start_at:Date; end_at:Date;
  visibility:ScheduleBlock['visibility']; status:ScheduleBlock['status'];
  approval_meeting_mode:ScheduleBlock['approvalMeetingMode'] | null;
}

function mapRequest(row: RequestRow): MeetingRequest {
  if (!row.room_id) throw new DomainError('ROOM_REQUIRED', '会议申请未选择会议室');
  return {
    id:row.id, bossUserId:row.boss_user_id, applicantUserId:row.applicant_user_id,
    roomId:row.room_id, title:row.topic, startAt:row.start_at, endAt:row.end_at,
    visibility:row.visibility, status:row.status, version:row.version,
    decisionBy:row.decided_by ?? undefined, decisionAt:row.decided_at ?? undefined,
    rejectionSource:row.rejection_source ?? undefined,
    approvedScheduleId:row.approved_schedule_id ?? undefined,
    approvalMeetingMode:row.approval_meeting_mode ?? undefined,
  };
}

function mapSchedule(row: ScheduleRow): ScheduleBlock {
  return {
    id:row.id, bossUserId:row.boss_user_id, roomId:row.room_id ?? undefined,
    sourceType:row.source_type, sourceId:row.source_id ?? row.id,
    title:row.title ?? '', startAt:row.start_at, endAt:row.end_at,
    visibility:row.visibility, status:row.status,
    approvalMeetingMode:row.approval_meeting_mode ?? undefined,
  };
}

class PostgresApprovalTransaction implements ApprovalTransaction {
  constructor(private readonly client: PoolClient) {}

  async lockRequest(id: string): Promise<MeetingRequest | null> {
    const result = await this.client.query<RequestRow>(
      `SELECT id, boss_user_id, applicant_user_id, room_id, topic, start_at, end_at,
               visibility, status, version, decided_by, decided_at, rejection_source,
              approved_schedule_id, approval_meeting_mode
       FROM meeting_requests WHERE id = $1 FOR UPDATE`, [id],
    );
    return result.rows[0] ? mapRequest(result.rows[0]) : null;
  }

  async lockBossAndRoom(bossUserId: string, roomId: string): Promise<void> {
    const boss = await this.client.query('SELECT id FROM app_users WHERE id = $1 FOR UPDATE', [bossUserId]);
    if (!boss.rowCount) throw new DomainError('BOSS_NOT_FOUND', '老板账号不存在');
    const room = await this.client.query('SELECT id FROM meeting_rooms WHERE id = $1 AND enabled FOR UPDATE', [roomId]);
    if (!room.rowCount) throw new DomainError('ROOM_NOT_FOUND', '会议室不存在或已停用');
  }

  async findActiveBossConflict(bossUserId: string, startAt: Date, endAt: Date): Promise<ScheduleBlock | null> {
    return this.findConflict('boss_user_id', bossUserId, startAt, endAt);
  }

  async findActiveRoomConflict(roomId: string, startAt: Date, endAt: Date): Promise<ScheduleBlock | null> {
    return this.findConflict('room_id', roomId, startAt, endAt);
  }

  private async findConflict(column: 'boss_user_id' | 'room_id', id: string, startAt: Date, endAt: Date) {
    const result = await this.client.query<ScheduleRow>(
      `SELECT id, boss_user_id, room_id, source_type, source_id, title, start_at, end_at, visibility, status, approval_meeting_mode
       FROM schedule_entries
       WHERE ${column} = $1 AND status = 'ACTIVE'
         AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')
       LIMIT 1`, [id, startAt, endAt],
    );
    return result.rows[0] ? mapSchedule(result.rows[0]) : null;
  }

  async insertSchedule(schedule: ScheduleBlock): Promise<void> {
    await this.client.query(
      `INSERT INTO schedule_entries
       (id, boss_user_id, room_id, source_type, source_id, title, start_at, end_at, visibility, status, created_by, approval_meeting_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$2,$11)`,
      [schedule.id, schedule.bossUserId, schedule.roomId ?? null, schedule.sourceType,
       schedule.sourceId, schedule.title, schedule.startAt, schedule.endAt,
       schedule.visibility, schedule.status, schedule.approvalMeetingMode ?? null],
    );
  }

  async saveRequest(request: MeetingRequest): Promise<void> {
    await this.client.query(
      `UPDATE meeting_requests SET status=$2, version=$3, decided_by=$4, decided_at=$5,
         rejection_source=$6, approved_schedule_id=$7, approval_meeting_mode=$8, updated_at=now() WHERE id=$1`,
      [request.id, request.status, request.version, request.decisionBy ?? null,
       request.decisionAt ?? null, request.rejectionSource ?? null,
       request.approvedScheduleId ?? null, request.approvalMeetingMode ?? null],
    );
    if (request.decisionBy && (request.status === 'APPROVED' || request.status === 'REJECTED')) {
      await this.client.query(
        `INSERT INTO approval_decisions (request_id, decision, decided_by, rejection_source, decided_at, approval_meeting_mode)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [request.id, request.status, request.decisionBy, request.rejectionSource ?? null,
         request.decisionAt ?? new Date(), request.approvalMeetingMode ?? null],
      );
    }
  }

  async findOverlappingPending(bossUserId: string, startAt: Date, endAt: Date, exceptId: string): Promise<MeetingRequest[]> {
    const result = await this.client.query<RequestRow>(
      `SELECT id, boss_user_id, applicant_user_id, room_id, topic, start_at, end_at,
               visibility, status, version, decided_by, decided_at, rejection_source,
              approved_schedule_id, approval_meeting_mode
       FROM meeting_requests
       WHERE boss_user_id=$1 AND id<>$4 AND status='PENDING'
         AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')
       ORDER BY id FOR UPDATE`, [bossUserId, startAt, endAt, exceptId],
    );
    return result.rows.map(mapRequest);
  }

  async enqueue(messages: readonly OutboxMessage[]): Promise<void> {
    for (const message of messages) {
      await this.client.query(
        `INSERT INTO notification_outbox
         (id, event_type, aggregate_type, aggregate_id, recipient_user_id, dedupe_key, payload)
         VALUES ($1,$2,'MEETING_REQUEST',$3,$4,$5,$6)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [message.id, message.type, message.aggregateId, message.recipientUserId,
         message.dedupeKey, JSON.stringify(message.payload)],
      );
    }
  }
}

@Injectable()
export class PostgresApprovalRepository implements ApprovalRepository {
  constructor(private readonly database: DatabaseService) {}

  async transaction<T>(work: (tx: ApprovalTransaction) => Promise<T>): Promise<T> {
    try {
      return await this.database.transaction((client) => work(new PostgresApprovalTransaction(client)));
    } catch (error) {
      if ((error as { code?:string }).code === '23P01') {
        throw new DomainError('SCHEDULE_CONFLICT', '该时段已产生新的日程冲突');
      }
      throw error;
    }
  }
}
