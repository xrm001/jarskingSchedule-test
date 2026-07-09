import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { NotificationService } from './notification.service';

type SummaryRecipient = { id:string; display_name:string; wecom_user_id:string };
type ScheduleRow = {
  id:string; title:string|null; source_type:string; start_at:Date; end_at:Date;
  visibility:string; room_name:string|null;
};
type PendingRequestRow = {
  id:string; applicant:string; topic:string; start_at:Date; end_at:Date; room_name:string|null;
};

@Injectable()
export class DailySummaryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DailySummaryService.name);
  private timer?: NodeJS.Timeout;
  private lastCheckedMinute = '';

  constructor(
    private readonly database:DatabaseService,
    private readonly notifications:NotificationService,
  ) {}

  onModuleInit():void {
    if (process.env.DAILY_SUMMARY_ENABLED === 'false') return;
    this.timer = setInterval(() => void this.checkSchedule(), 60_000);
    this.timer.unref?.();
    void this.resumeTodaySummary();
    void this.checkSchedule();
  }

  onModuleDestroy():void {
    if (this.timer) clearInterval(this.timer);
  }

  async sendTodaySummary(trigger:'scheduled'|'manual'='manual') {
    const date = shanghaiDateKey(new Date());
    return this.sendSummaryForDate(date, trigger);
  }

  async sendSummaryForDate(date:string, trigger:'scheduled'|'manual'='manual') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException({ code:'INVALID_SUMMARY_DATE', message:'摘要日期格式应为 YYYY-MM-DD' });
    }
    const recipients = await this.summaryRecipients();
    if (!recipients.length) {
      throw new BadRequestException({ code:'SUMMARY_RECIPIENT_MISSING', message:'未找到已绑定企微 UserID 的老板或管理员，无法发送摘要' });
    }
    const content = await this.renderSummary(date);
    const aggregateId = await this.summaryAggregateId();
    await this.notifications.enqueue(recipients.map(recipient => ({
      eventType:'DAILY_SUMMARY',
      aggregateType:'daily_summary',
      aggregateId,
      recipientUserId:recipient.id,
      dedupeKey:`daily-summary:${date}:${recipient.id}`,
      payload:{ date, content, trigger },
    })));
    const delivery = await this.notifications.processPendingDailySummary(date, recipients.length);
    return { ok:true, date, recipients:recipients.length, delivery, content };
  }

  private async checkSchedule():Promise<void> {
    try {
      const now = new Date();
      const minuteKey = shanghaiMinuteKey(now);
      if (minuteKey === this.lastCheckedMinute) return;
      this.lastCheckedMinute = minuteKey;
      const time = shanghaiTime(now);
      if (time !== '09:00') return;
      await this.sendSummaryForDate(shanghaiDateKey(now), 'scheduled');
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    }
  }

  private async resumeTodaySummary():Promise<void> {
    try {
      const now = new Date();
      if (shanghaiTime(now) < '09:00') return;
      const date = shanghaiDateKey(now);
      const state = await this.database.query<{ pending:string; sent:string }>(
        `SELECT
           COUNT(*) FILTER (WHERE status='PENDING')::text AS pending,
           COUNT(*) FILTER (WHERE status='SENT')::text AS sent
         FROM notification_outbox
         WHERE event_type='DAILY_SUMMARY' AND dedupe_key LIKE $1`,
        [`daily-summary:${date}:%`],
      );
      const pending = Number(state.rows[0]?.pending ?? 0);
      const sent = Number(state.rows[0]?.sent ?? 0);
      if (pending > 0) {
        await this.notifications.processPendingDailySummary(date, pending);
        return;
      }
      if (sent === 0) this.logger.log(`No pending daily summary found for ${date}; skip startup backfill.`);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    }
  }

  private async summaryRecipients():Promise<SummaryRecipient[]> {
    const [bosses, admins] = await Promise.all([this.bossRecipients(), this.adminRecipients()]);
    const byId = new Map<string, SummaryRecipient>();
    [...bosses, ...admins].forEach(recipient => {
      if (!byId.has(recipient.id)) byId.set(recipient.id, recipient);
    });
    return [...byId.values()];
  }

  private async bossRecipients():Promise<SummaryRecipient[]> {
    const result = await this.database.query<SummaryRecipient>(
      `SELECT u.id,u.display_name,u.wecom_user_id
       FROM app_users u
       JOIN user_roles r ON r.user_id=u.id AND r.role='BOSS'
       WHERE u.status='ACTIVE' AND u.removed_at IS NULL
         AND u.wecom_user_id IS NOT NULL AND btrim(u.wecom_user_id)<>''
         AND ($1::uuid IS NULL OR u.id=$1::uuid)
         AND ($2::text IS NULL OR u.wecom_user_id=$2)
       ORDER BY u.created_at
       LIMIT 1`,
      [process.env.BOSS_APP_USER_ID || null, process.env.BOSS_WECOM_USER_ID || null],
    );
    return result.rows;
  }

  private async adminRecipients():Promise<SummaryRecipient[]> {
    const result = await this.database.query<SummaryRecipient>(
      `SELECT u.id,u.display_name,u.wecom_user_id
       FROM app_users u
       JOIN user_roles r ON r.user_id=u.id AND r.role='ADMIN'
       WHERE u.status='ACTIVE' AND u.removed_at IS NULL
         AND u.wecom_user_id IS NOT NULL AND btrim(u.wecom_user_id)<>''
       ORDER BY u.display_name`,
    );
    return result.rows;
  }

  private async renderSummary(date:string):Promise<string> {
    const [schedules, pending] = await Promise.all([this.scheduleRows(date), this.pendingRequestRows(date)]);
    const title = `【石总今日日程摘要】${formatChineseDate(date)}`;
    if (!schedules.length && !pending.length) return `${title}\n\n今日无日程。`;

    const lines:string[] = [title, '', `今日共 ${schedules.length} 项安排。`];
    if (schedules.length) {
      schedules.forEach((item, index) => {
        const room = item.room_name ? `｜${item.room_name}` : '';
        lines.push(`${index + 1}. ${formatTime(item.start_at)}–${formatTime(item.end_at)}｜${entryTitle(item)}${room}`);
        lines.push(`   类型：${entryType(item.source_type)}｜可见范围：${visibilityLabel(item.visibility)}`);
      });
    } else {
      lines.push('今日无已确认日程。');
    }
    lines.push('');
    if (pending.length) {
      lines.push(`待处理审批：${pending.length} 条`);
      pending.forEach(item => {
        const room = item.room_name || '未选择会议室';
        lines.push(`- ${formatTime(item.start_at)}–${formatTime(item.end_at)}｜${item.applicant}｜${item.topic}｜${room}`);
      });
    } else {
      lines.push('待处理审批：0 条');
    }
    lines.push('', '提醒：本摘要由系统每天 09:00 自动发送。');
    return lines.join('\n').slice(0, 1900);
  }

  private async scheduleRows(date:string):Promise<ScheduleRow[]> {
    const result = await this.database.query<ScheduleRow>(
      `SELECT s.id,s.title,s.source_type,s.start_at,s.end_at,s.visibility,r.name room_name
       FROM schedule_entries s
       LEFT JOIN meeting_rooms r ON r.id=s.room_id
       WHERE s.status='ACTIVE'
         AND s.start_at < (($1::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')
         AND s.end_at > ($1::date::timestamp AT TIME ZONE 'Asia/Shanghai')
       ORDER BY s.start_at,s.created_at`,
      [date],
    );
    return result.rows;
  }

  private async pendingRequestRows(date:string):Promise<PendingRequestRow[]> {
    const result = await this.database.query<PendingRequestRow>(
      `SELECT mr.id,u.display_name applicant,mr.topic,mr.start_at,mr.end_at,r.name room_name
       FROM meeting_requests mr
       JOIN app_users u ON u.id=mr.applicant_user_id
       LEFT JOIN meeting_rooms r ON r.id=mr.room_id
       WHERE mr.status='PENDING'
         AND mr.start_at < (($1::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')
         AND mr.end_at > ($1::date::timestamp AT TIME ZONE 'Asia/Shanghai')
       ORDER BY mr.start_at,mr.created_at`,
      [date],
    );
    return result.rows;
  }

  private async summaryAggregateId():Promise<string> {
    const result = await this.database.query<{ id:string }>(
      `SELECT u.id FROM app_users u
       JOIN user_roles r ON r.user_id=u.id AND r.role='BOSS'
       WHERE u.status='ACTIVE' AND u.removed_at IS NULL
       ORDER BY u.created_at LIMIT 1`,
    );
    return result.rows[0]?.id ?? (await this.summaryRecipients())[0]!.id;
  }
}

function shanghaiParts(date:Date):Record<string,string> {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false,
  }).formatToParts(date).map(part => [part.type, part.value]));
}

function shanghaiDateKey(date:Date):string {
  const parts = shanghaiParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shanghaiMinuteKey(date:Date):string {
  const parts = shanghaiParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function shanghaiTime(date:Date):string {
  const parts = shanghaiParts(date);
  return `${parts.hour}:${parts.minute}`;
}

function formatTime(date:Date):string {
  return date.toLocaleTimeString('zh-CN', { timeZone:'Asia/Shanghai', hour:'2-digit', minute:'2-digit', hour12:false });
}

function formatChineseDate(date:string):string {
  const value = new Date(`${date}T00:00:00+08:00`);
  return value.toLocaleDateString('zh-CN', { timeZone:'Asia/Shanghai', month:'long', day:'numeric', weekday:'long' });
}

function entryTitle(row:ScheduleRow):string {
  if (row.title?.trim()) return row.title.trim();
  if (row.source_type === 'PERSONAL') return '个人行程';
  if (row.source_type === 'STATUS_BLOCK') return '状态占用';
  return '会议安排';
}

function entryType(type:string):string {
  if (type === 'PERSONAL') return '个人行程';
  if (type === 'APPROVED_REQUEST') return '已审批会议';
  if (type === 'ORGANIZED_MEETING') return '老板组织会议';
  if (type === 'STATUS_BLOCK') return '状态占用';
  return type;
}

function visibilityLabel(value:string):string {
  return value === 'BOSS_ONLY' ? '内容仅自己可见' : '内容全员可见';
}
