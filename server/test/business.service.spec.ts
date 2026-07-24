import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../src/modules/database/database.service';
import { BusinessService } from '../src/modules/business/business.service';
import type { BossSpaceService } from '../src/modules/boss-spaces/boss-space.service';

const actor = { id:'manager-1', wecomUserId:'manager', roles:['MANAGEMENT'] as const };
const bossSpaces = {
  resolveBossId: vi.fn().mockResolvedValue('boss-1'),
  resolveByBossId: vi.fn().mockResolvedValue({ id:'shi', bossUserId:'boss-1', displayName:'石总', shortName:'石', isDefault:true }),
} as unknown as BossSpaceService;

describe('BusinessService', () => {
  it('returns available when no boss status has been recorded', async () => {
    const query = vi.fn().mockResolvedValue({ rows:[], rowCount:0 });
    const service = new BusinessService({ query } as unknown as DatabaseService, bossSpaces);
    await expect(service.currentBossStatus()).resolves.toMatchObject({ status:'available', available:true });
  });

  it('derives meeting status from an active scheduled meeting', async () => {
    const query = vi.fn().mockResolvedValue({
      rows:[{
        id:'schedule-1',
        source_type:'ORGANIZED_MEETING',
        schedule_kind:'meeting',
        title:'经营复盘',
        start_at:new Date('2026-07-23T02:00:00.000Z'),
        end_at:new Date('2026-07-23T03:00:00.000Z'),
      }],
      rowCount:1,
    });
    const service = new BusinessService({ query } as unknown as DatabaseService, bossSpaces);
    await expect(service.currentBossStatus()).resolves.toMatchObject({
      status:'meeting',
      available:false,
      scheduleId:'schedule-1',
    });
  });

  it('derives out status from an active external schedule', async () => {
    const query = vi.fn().mockResolvedValue({
      rows:[{
        id:'schedule-2',
        source_type:'PERSONAL',
        schedule_kind:'out',
        title:'拜访客户',
        start_at:new Date('2026-07-23T02:00:00.000Z'),
        end_at:new Date('2026-07-23T06:00:00.000Z'),
      }],
      rowCount:1,
    });
    const service = new BusinessService({ query } as unknown as DatabaseService, bossSpaces);
    await expect(service.currentBossStatus()).resolves.toMatchObject({
      status:'out',
      available:false,
      scheduleId:'schedule-2',
    });
  });

  it('rejects meeting requests outside 09:00-19:00 Shanghai time', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows:[{ id:'boss-1' }], rowCount:1 });
    const service = new BusinessService({ query } as unknown as DatabaseService, bossSpaces);
    await expect(service.createMeetingRequest(actor, {
      topic:'测试会议', roomId:'room-1',
      startAt:'2026-07-06T08:00:00+08:00', endAt:'2026-07-06T09:00:00+08:00',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows meeting requests ending at 19:00 Shanghai time', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows:[{}], rowCount:1 })
      .mockResolvedValueOnce({ rows:[{ id:'request-1', version:1 }], rowCount:1 });
    const service = new BusinessService({ query } as unknown as DatabaseService, bossSpaces);
    await expect(service.createMeetingRequest(actor, {
      topic:'测试会议', roomId:'room-1',
      startAt:'2026-07-06T18:30:00+08:00', endAt:'2026-07-06T19:00:00+08:00',
    })).resolves.toMatchObject({ id:'request-1', status:'pending' });
  });

  it('maps database exclusion conflicts to a domain-safe conflict response', async () => {
    const error = Object.assign(new Error('exclusion'), { code:'23P01' });
    const query = vi.fn().mockRejectedValue(error);
    const service = new BusinessService({ query } as unknown as DatabaseService, bossSpaces);
    await expect(service.createPersonalSchedule(
      { id:'boss-1', wecomUserId:'boss', roles:['BOSS'] },
      { title:'个人行程', startAt:'2026-07-06T10:00:00+08:00', endAt:'2026-07-06T11:00:00+08:00' },
    )).rejects.toBeInstanceOf(ConflictException);
  });
});
