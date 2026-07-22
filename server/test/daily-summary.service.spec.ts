import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../src/modules/database/database.service';
import { DailySummaryService } from '../src/modules/notifications/daily-summary.service';
import type { NotificationService } from '../src/modules/notifications/notification.service';

describe('DailySummaryService', () => {
  it('sends "今日无日程" to the bound boss and admins when the day has no schedule', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows:[{ id:'boss-1', display_name:'石荣军', wecom_user_id:'andyshi@jxpack' }] })
      .mockResolvedValueOnce({ rows:[{ id:'admin-1', display_name:'管理员', wecom_user_id:'admin' }] })
      .mockResolvedValueOnce({ rows:[] })
      .mockResolvedValueOnce({ rows:[] })
      .mockResolvedValueOnce({ rows:[{ id:'boss-1' }] });
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const processPendingDailySummary = vi.fn().mockResolvedValue({ ok:true, picked:2, sent:2, failed:0 });
    const service = new DailySummaryService(
      { query } as unknown as DatabaseService,
      { enqueue, processPendingDailySummary } as unknown as NotificationService,
    );

    const result = await service.sendSummaryForDate('2026-07-07', 'manual');

    expect(result.content).toContain('今日无日程');
    expect(enqueue).toHaveBeenCalledWith([
      expect.objectContaining({
        eventType:'DAILY_SUMMARY',
        recipientUserId:'boss-1',
        dedupeKey:'daily-summary:2026-07-07:boss-1',
        payload:expect.objectContaining({ content:expect.stringContaining('今日无日程') }),
      }),
      expect.objectContaining({
        eventType:'DAILY_SUMMARY',
        recipientUserId:'admin-1',
        dedupeKey:'daily-summary:2026-07-07:admin-1',
        payload:expect.objectContaining({ content:expect.stringContaining('今日无日程') }),
      }),
    ]);
    expect(processPendingDailySummary).toHaveBeenCalledWith('2026-07-07', 2);
  });
});
