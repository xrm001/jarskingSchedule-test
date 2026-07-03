import { randomUUID } from 'node:crypto';
import type { MeetingRequest, OutboxMessage, ScheduleBlock } from '../../domain/model';
import { overlaps } from '../../domain/model';
import type { ApprovalRepository, ApprovalTransaction } from './approval.repository';

/** Test/demo adapter only. Production must use PostgreSQL row locks and GiST exclusion constraints. */
export class InMemoryApprovalRepository implements ApprovalRepository, ApprovalTransaction {
  requests = new Map<string, MeetingRequest>();
  schedules = new Map<string, ScheduleBlock>();
  outbox = new Map<string, OutboxMessage>();
  private queue: Promise<void> = Promise.resolve();

  async transaction<T>(work: (tx: ApprovalTransaction) => Promise<T>): Promise<T> {
    let release!: () => void;
    const predecessor = this.queue;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await predecessor;
    const snapshot = structuredClone({ requests: this.requests, schedules: this.schedules, outbox: this.outbox });
    try { return await work(this); }
    catch (error) {
      this.requests = snapshot.requests;
      this.schedules = snapshot.schedules;
      this.outbox = snapshot.outbox;
      throw error;
    } finally { release(); }
  }

  async lockRequest(id: string): Promise<MeetingRequest | null> { return this.requests.get(id) ?? null; }
  async lockBossAndRoom(): Promise<void> {}
  async findActiveBossConflict(bossId: string, start: Date, end: Date): Promise<ScheduleBlock | null> {
    return [...this.schedules.values()].find((s) => s.status === 'ACTIVE' && s.bossUserId === bossId && overlaps(start, end, s.startAt, s.endAt)) ?? null;
  }
  async findActiveRoomConflict(roomId: string, start: Date, end: Date): Promise<ScheduleBlock | null> {
    return [...this.schedules.values()].find((s) => s.status === 'ACTIVE' && s.roomId === roomId && overlaps(start, end, s.startAt, s.endAt)) ?? null;
  }
  async insertSchedule(schedule: ScheduleBlock): Promise<void> { this.schedules.set(schedule.id, schedule); }
  async saveRequest(request: MeetingRequest): Promise<void> { this.requests.set(request.id, request); }
  async findOverlappingPending(bossId: string, start: Date, end: Date, exceptId: string): Promise<MeetingRequest[]> {
    return [...this.requests.values()].filter((r) => r.id !== exceptId && r.bossUserId === bossId && r.status === 'PENDING' && overlaps(start, end, r.startAt, r.endAt));
  }
  async enqueue(messages: readonly OutboxMessage[]): Promise<void> {
    for (const message of messages) this.outbox.set(message.dedupeKey || randomUUID(), message);
  }
}
