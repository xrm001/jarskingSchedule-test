import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../src/modules/database/database.service';
import { BusinessService } from '../src/modules/business/business.service';

const actor = { id:'manager-1', wecomUserId:'manager', roles:['MANAGEMENT'] as const };

describe('BusinessService', () => {
  it('returns available when no boss status has been recorded', async () => {
    const query = vi.fn().mockResolvedValue({ rows:[], rowCount:0 });
    const service = new BusinessService({ query } as unknown as DatabaseService);
    await expect(service.currentBossStatus()).resolves.toMatchObject({ status:'available', available:true });
  });

  it('rejects meeting requests outside 09:00-18:00 Shanghai time', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows:[{ id:'boss-1' }], rowCount:1 });
    const service = new BusinessService({ query } as unknown as DatabaseService);
    await expect(service.createMeetingRequest(actor, {
      topic:'测试会议', roomId:'room-1',
      startAt:'2026-07-06T08:00:00+08:00', endAt:'2026-07-06T09:00:00+08:00',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps database exclusion conflicts to a domain-safe conflict response', async () => {
    const error = Object.assign(new Error('exclusion'), { code:'23P01' });
    const query = vi.fn().mockRejectedValue(error);
    const service = new BusinessService({ query } as unknown as DatabaseService);
    await expect(service.createPersonalSchedule(
      { id:'boss-1', wecomUserId:'boss', roles:['BOSS'] },
      { title:'个人行程', startAt:'2026-07-06T10:00:00+08:00', endAt:'2026-07-06T11:00:00+08:00' },
    )).rejects.toBeInstanceOf(ConflictException);
  });
});
