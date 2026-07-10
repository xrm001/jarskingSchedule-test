import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../src/modules/database/database.service';
import { ResourcesService } from '../src/modules/resources/resources.service';
import type { BossSpaceService } from '../src/modules/boss-spaces/boss-space.service';

const management = { id: 'm1', wecomUserId: 'u1', displayName: '管理层成员', jobTitle: '经理', department: '管理层' };
const bossSpaces = { resolveBossId: vi.fn().mockResolvedValue('boss1') } as unknown as BossSpaceService;

describe('ResourcesService', () => {
  it('returns management directory data from PostgreSQL', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [management], rowCount: 1 });
    const service = new ResourcesService({ query } as unknown as DatabaseService, bossSpaces);
    await expect(service.listManagement()).resolves.toEqual([management]);
  });

  it('masks a boss-only personal schedule for management', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{
        id: 's1', sourceType: 'PERSONAL', title: '私人安排',
        startAt: new Date('2026-07-06T02:00:00Z'), endAt: new Date('2026-07-06T03:00:00Z'),
        visibility: 'BOSS_ONLY', roomName: '18楼会议室',
      }], rowCount: 1 });
    const service = new ResourcesService({ query } as unknown as DatabaseService, bossSpaces);
    const rows = await service.listBossSchedule('boss1', '2026-07-06', {
      id: 'm1', wecomUserId: 'u1', roles: ['MANAGEMENT'],
    });
    expect(rows[0]).toMatchObject({ title: '已占用', roomName: null });
  });

  it('shows private content to the boss', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{}], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{
        id: 's1', sourceType: 'PERSONAL', title: '私人安排',
        startAt: new Date('2026-07-06T02:00:00Z'), endAt: new Date('2026-07-06T03:00:00Z'),
        visibility: 'BOSS_ONLY', roomName: null,
      }], rowCount: 1 });
    const service = new ResourcesService({ query } as unknown as DatabaseService, bossSpaces);
    const rows = await service.listBossSchedule('boss1', '2026-07-06', {
      id: 'boss1', wecomUserId: 'boss', roles: ['BOSS'],
    });
    expect(rows[0]?.title).toBe('私人安排');
  });
});
