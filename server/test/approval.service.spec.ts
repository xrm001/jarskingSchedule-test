import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser, MeetingRequest, ScheduleBlock } from '../src/domain/model';
import { BossIdentityService } from '../src/modules/auth/boss-identity.service';
import { ApprovalService } from '../src/modules/approvals/approval.service';
import { InMemoryApprovalRepository } from '../src/modules/approvals/in-memory-approval.repository';

const actor: AuthenticatedUser = { id: 'boss-db-id', wecomUserId: 'shi-zong', roles: ['BOSS'] };
const request = (id: string, start: string, end: string, roomId = 'room-1'): MeetingRequest => ({
  id, bossUserId: actor.id, applicantUserId: `applicant-${id}`, roomId, title: id,
  startAt: new Date(start), endAt: new Date(end), visibility: 'ALL_MEMBERS', status: 'PENDING', version: 1,
});
const block = (
  id: string,
  bossUserId: string,
  start: string,
  end: string,
  roomId?: string,
): ScheduleBlock => ({
  id,
  bossUserId,
  roomId,
  sourceType: 'PERSONAL',
  sourceId: `source-${id}`,
  title: id,
  startAt: new Date(start),
  endAt: new Date(end),
  visibility: 'BOSS_ONLY',
  status: 'ACTIVE',
});

describe('ApprovalService', () => {
  let repo: InMemoryApprovalRepository;
  let service: ApprovalService;
  beforeEach(() => {
    process.env.BOSS_WECOM_USER_ID = actor.wecomUserId;
    process.env.BOSS_APP_USER_ID = actor.id;
    repo = new InMemoryApprovalRepository();
    service = new ApprovalService(repo, new BossIdentityService(), { query: async () => ({ rows:[], rowCount:0 }) } as never);
  });

  it('approves one request and rejects every overlapping pending request', async () => {
    const winner = request('winner', '2026-07-03T05:30:00Z', '2026-07-03T06:30:00Z');
    const overlap = request('overlap', '2026-07-03T06:00:00Z', '2026-07-03T07:00:00Z', 'room-2');
    const adjacent = request('adjacent', '2026-07-03T06:30:00Z', '2026-07-03T07:00:00Z');
    [winner, overlap, adjacent].forEach((item) => repo.requests.set(item.id, item));
    const result = await service.approve('winner', 1, actor);
    expect(result.autoRejectedIds).toEqual(['overlap']);
    expect(repo.requests.get('winner')?.status).toBe('APPROVED');
    expect(repo.requests.get('overlap')?.rejectionSource).toBe('OVERLAP_AUTO');
    expect(repo.requests.get('adjacent')?.status).toBe('PENDING');
  });

  it('stores the approval meeting mode on the request, schedule, and notification payload', async () => {
    repo.requests.set('remote', request('remote', '2026-07-03T05:30:00Z', '2026-07-03T06:30:00Z'));
    const result = await service.approve('remote', 1, actor, 'REMOTE');
    expect(result.approved.approvalMeetingMode).toBe('REMOTE');
    expect(result.schedule.approvalMeetingMode).toBe('REMOTE');
    expect([...repo.outbox.values()][0]?.payload).toMatchObject({ meetingMode:'REMOTE' });
  });

  it('serializes concurrent approvals so only one overlapping request wins', async () => {
    repo.requests.set('a', request('a', '2026-07-03T05:00:00Z', '2026-07-03T06:00:00Z'));
    repo.requests.set('b', request('b', '2026-07-03T05:30:00Z', '2026-07-03T06:30:00Z', 'room-2'));
    const results = await Promise.allSettled([service.approve('a', 1, actor), service.approve('b', 1, actor)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect([...repo.schedules.values()]).toHaveLength(1);
  });

  it('does not allow an administrator to approve', async () => {
    repo.requests.set('a', request('a', '2026-07-03T05:00:00Z', '2026-07-03T06:00:00Z'));
    await expect(service.approve('a', 1, { id: 'admin', wecomUserId: 'admin', roles: ['ADMIN'] }))
      .rejects.toMatchObject({ code: 'BOSS_ONLY' });
  });

  it('rejects an invalid or empty time range before writing a schedule', async () => {
    repo.requests.set('invalid', request('invalid', '2026-07-03T06:00:00Z', '2026-07-03T06:00:00Z'));
    await expect(service.approve('invalid', 1, actor)).rejects.toMatchObject({ code: 'INVALID_TIME_RANGE' });
    expect(repo.schedules.size).toBe(0);
    expect(repo.requests.get('invalid')?.status).toBe('PENDING');
  });

  it('rejects a request targeting any other internal boss account', async () => {
    const wrongTarget = request('wrong-target', '2026-07-03T06:00:00Z', '2026-07-03T07:00:00Z');
    wrongTarget.bossUserId = 'another-boss';
    repo.requests.set(wrongTarget.id, wrongTarget);
    await expect(service.approve(wrongTarget.id, 1, actor)).rejects.toMatchObject({ code: 'BOSS_ONLY' });
  });

  it('rejects a stale expectedVersion without changing state', async () => {
    repo.requests.set('stale', request('stale', '2026-07-03T06:00:00Z', '2026-07-03T07:00:00Z'));
    await expect(service.approve('stale', 0, actor)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(repo.requests.get('stale')).toMatchObject({ status: 'PENDING', version: 1 });
    expect(repo.schedules.size).toBe(0);
    expect(repo.outbox.size).toBe(0);
  });

  it('rejects a repeated approval and does not create a second schedule', async () => {
    repo.requests.set('once', request('once', '2026-07-03T06:00:00Z', '2026-07-03T07:00:00Z'));
    await service.approve('once', 1, actor);
    await expect(service.approve('once', 2, actor)).rejects.toMatchObject({ code: 'REQUEST_STATE_CHANGED' });
    expect(repo.schedules.size).toBe(1);
    expect(repo.outbox.size).toBe(1);
  });

  it('rolls back approval changes when the meeting room conflicts', async () => {
    repo.requests.set('room-conflict', request('room-conflict', '2026-07-03T06:00:00Z', '2026-07-03T07:00:00Z'));
    const occupied = block('occupied-room', 'another-boss', '2026-07-03T06:30:00Z', '2026-07-03T07:30:00Z', 'room-1');
    repo.schedules.set(occupied.id, occupied);
    await expect(service.approve('room-conflict', 1, actor)).rejects.toMatchObject({ code: 'ROOM_CONFLICT' });
    expect(repo.requests.get('room-conflict')).toMatchObject({ status: 'PENDING', version: 1 });
    expect([...repo.schedules.keys()]).toEqual(['occupied-room']);
    expect(repo.outbox.size).toBe(0);
  });

  it('rejects approval when the boss already has an overlapping schedule', async () => {
    repo.requests.set('boss-conflict', request('boss-conflict', '2026-07-03T06:00:00Z', '2026-07-03T07:00:00Z'));
    const occupied = block('occupied-boss', actor.id, '2026-07-03T05:30:00Z', '2026-07-03T06:30:00Z', 'room-2');
    repo.schedules.set(occupied.id, occupied);
    await expect(service.approve('boss-conflict', 1, actor)).rejects.toMatchObject({ code: 'BOSS_SCHEDULE_CONFLICT' });
    expect(repo.requests.get('boss-conflict')).toMatchObject({ status: 'PENDING', version: 1 });
    expect(repo.outbox.size).toBe(0);
  });

  it('returns REQUEST_NOT_FOUND for an unknown request id', async () => {
    await expect(service.approve('missing', 1, actor)).rejects.toMatchObject({ code: 'REQUEST_NOT_FOUND' });
    expect(repo.schedules.size).toBe(0);
    expect(repo.outbox.size).toBe(0);
  });

  it('allows the boss to reject without a reason and notifies the applicant', async () => {
    repo.requests.set('reject-me', request('reject-me', '2026-07-03T06:00:00Z', '2026-07-03T07:00:00Z'));
    const rejected = await service.reject('reject-me', 1, actor);
    expect(rejected).toMatchObject({ status: 'REJECTED', rejectionSource: 'MANUAL', version: 2 });
    expect([...repo.outbox.values()][0]?.type).toBe('REQUEST_REJECTED');
    expect(repo.schedules.size).toBe(0);
  });

  it('does not allow an administrator to reject', async () => {
    repo.requests.set('reject-me', request('reject-me', '2026-07-03T06:00:00Z', '2026-07-03T07:00:00Z'));
    await expect(service.reject('reject-me', 1, {
      id: 'admin', wecomUserId: 'admin', roles: ['ADMIN'],
    })).rejects.toMatchObject({ code: 'BOSS_ONLY' });
    expect(repo.requests.get('reject-me')?.status).toBe('PENDING');
  });
});
