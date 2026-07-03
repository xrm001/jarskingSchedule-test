import type { MeetingRequest, OutboxMessage, ScheduleBlock } from '../../domain/model';

/** Implement with one PostgreSQL transaction and resource rows locked in a fixed order. */
export interface ApprovalTransaction {
  lockRequest(id: string): Promise<MeetingRequest | null>;
  lockBossAndRoom(bossUserId: string, roomId: string): Promise<void>;
  findActiveBossConflict(bossUserId: string, startAt: Date, endAt: Date): Promise<ScheduleBlock | null>;
  findActiveRoomConflict(roomId: string, startAt: Date, endAt: Date): Promise<ScheduleBlock | null>;
  insertSchedule(schedule: ScheduleBlock): Promise<void>;
  saveRequest(request: MeetingRequest): Promise<void>;
  findOverlappingPending(bossUserId: string, startAt: Date, endAt: Date, exceptId: string): Promise<MeetingRequest[]>;
  enqueue(messages: readonly OutboxMessage[]): Promise<void>;
}

export interface ApprovalRepository {
  transaction<T>(work: (tx: ApprovalTransaction) => Promise<T>): Promise<T>;
}

export const APPROVAL_REPOSITORY = Symbol('APPROVAL_REPOSITORY');
