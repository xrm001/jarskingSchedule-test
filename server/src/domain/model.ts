export type UserRole = 'BOSS' | 'ADMIN' | 'MANAGEMENT';
export type Visibility = 'MANAGEMENT' | 'BUSY_ONLY' | 'BOSS_ADMIN';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';

export interface AuthenticatedUser {
  id: string;
  wecomUserId: string;
  roles: readonly UserRole[];
}

export interface MeetingRequest {
  id: string;
  bossUserId: string;
  applicantUserId: string;
  roomId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  visibility: Visibility;
  status: RequestStatus;
  version: number;
  decisionBy?: string;
  decisionAt?: Date;
  rejectionSource?: 'MANUAL' | 'OVERLAP_AUTO';
  approvedScheduleId?: string;
}

export interface ScheduleBlock {
  id: string;
  bossUserId: string;
  roomId?: string;
  sourceType: 'REQUEST' | 'PERSONAL';
  sourceId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  visibility: Visibility;
  status: 'ACTIVE' | 'CANCELLED' | 'COMPLETED';
}

export interface OutboxMessage {
  id: string;
  type: 'REQUEST_APPROVED' | 'REQUEST_AUTO_REJECTED' | 'REQUEST_REJECTED';
  aggregateId: string;
  recipientUserId: string;
  dedupeKey: string;
  payload: Readonly<Record<string, unknown>>;
}

export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean =>
  aStart < bEnd && bStart < aEnd;
