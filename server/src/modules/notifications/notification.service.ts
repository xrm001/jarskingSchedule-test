import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { WeComClientService } from '../auth/wecom-client.service';
import type { AuthenticatedUser } from '../../domain/model';

type OutboxRow = {
  id:string;
  event_type:string;
  aggregate_type:string;
  aggregate_id:string;
  recipient_user_id:string;
  payload:Record<string, unknown>;
  attempts:number;
  wecom_user_id:string|null;
  recipient_name:string;
  applicant_name:string|null;
  topic:string|null;
  room_name:string|null;
  start_at:Date|null;
  end_at:Date|null;
};

@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationService.name);
  private worker?: NodeJS.Timeout;

  constructor(private readonly database:DatabaseService, private readonly wecom:WeComClientService) {}

  onModuleInit():void {
    if (process.env.NOTIFICATION_WORKER_ENABLED === 'false') return;
    this.worker = setInterval(() => void this.runWorker(), 60_000);
    this.worker.unref?.();
    void this.runWorker();
  }

  onModuleDestroy():void {
    if (this.worker) clearInterval(this.worker);
  }

  private async runWorker():Promise<void> {
    try {
      await this.reconcileExpiredManualStatuses();
      await this.enqueueManualOutTwoHourReminders();
      await this.enqueueUpcomingMeetingReminders(30);
      await this.enqueueUpcomingMeetingReminders(10);
      await this.processPending(50);
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
    }
  }

  async enqueue(messages:Array<{eventType:string;aggregateType:string;aggregateId:string;recipientUserId:string;dedupeKey:string;payload?:Record<string,unknown>}>):Promise<void> {
    for (const message of messages) {
      await this.database.query(
        `INSERT INTO notification_outbox
         (event_type,aggregate_type,aggregate_id,recipient_user_id,dedupe_key,payload)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (dedupe_key) DO NOTHING`,
        [message.eventType,message.aggregateType,message.aggregateId,message.recipientUserId,message.dedupeKey,JSON.stringify(message.payload ?? {})],
      );
    }
  }

  async sendAdminTestMessage(actor:AuthenticatedUser) {
    if (!actor.wecomUserId) throw new BadRequestException({ code:'WECOM_USER_ID_MISSING', message:'当前管理员未绑定企业微信 UserID' });
    await this.wecom.sendTextMessage(actor.wecomUserId, [
      '【Jarsking日程】企微应用消息测试',
      `接收人：${actor.name || actor.wecomUserId}`,
      '如果你能收到这条消息，说明自建应用消息通道可用。',
    ].join('\n'));
    return { ok:true };
  }

  async processPending(limit=20) {
    await this.expireInvalidScheduleNotifications();
    const rows = await this.lockPendingRows(Math.max(1, Math.min(limit, 100)));
    return this.sendRows(rows);
  }

  async processPendingForAggregate(aggregateId:string, limit=20) {
    await this.expireInvalidScheduleNotifications();
    const rows = await this.lockPendingRows(Math.max(1, Math.min(limit, 100)), { aggregateId });
    return this.sendRows(rows);
  }

  async processPendingDailySummary(date:string, limit=20) {
    const rows = await this.lockPendingRows(Math.max(1, Math.min(limit, 100)), {
      eventType:'DAILY_SUMMARY',
      dedupePrefix:`daily-summary:${date}:`,
    });
    return this.sendRows(rows);
  }

  private async sendRows(rows:OutboxRow[]) {
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        if (!row.wecom_user_id) throw new Error(`recipient ${row.recipient_user_id} has no wecom_user_id`);
        await this.wecom.sendTextMessage(row.wecom_user_id, this.renderMessage(row));
        await this.database.query(
          `UPDATE notification_outbox SET status='SENT', sent_at=now(), last_error=NULL WHERE id=$1`,
          [row.id],
        );
        await this.createInboxEntry(row);
        sent += 1;
      } catch (error) {
        failed += 1;
        const attempts = row.attempts + 1;
        await this.database.query(
          `UPDATE notification_outbox
           SET status=CASE WHEN $2::int >= 5 THEN 'FAILED'::outbox_status ELSE 'PENDING'::outbox_status END,
               attempts=$2,
               available_at=now()+($2 * interval '5 minutes'),
               last_error=$3
           WHERE id=$1`,
          [row.id, attempts, error instanceof Error ? error.message : String(error)],
        );
      }
    }
    return { ok:true, picked:rows.length, sent, failed };
  }

  async previewOutbox(limit=20) {
    const result = await this.database.query(
      `SELECT n.id,n.event_type,n.status,n.attempts,n.last_error,n.created_at,n.available_at,
              u.display_name recipient_name,u.wecom_user_id
       FROM notification_outbox n JOIN app_users u ON u.id=n.recipient_user_id
       ORDER BY n.created_at DESC LIMIT $1`,
      [Math.max(1, Math.min(limit, 100))],
    );
    return result.rows;
  }

  async enqueueScheduleChange(scheduleId:string, eventType:'SCHEDULE_UPDATED'|'SCHEDULE_CANCELLED'):Promise<void> {
    const recipients = await this.scheduleRecipients(scheduleId);
    await this.enqueue(recipients.map(recipient => ({
      eventType,
      aggregateType:'schedule_entry',
      aggregateId:scheduleId,
      recipientUserId:recipient.id,
      dedupeKey:`${eventType.toLowerCase()}:${scheduleId}:${recipient.id}:${Date.now()}`,
      payload:{},
    })));
  }

  private async reconcileExpiredManualStatuses():Promise<void> {
    await this.database.query(
      `WITH expired AS (
         UPDATE boss_status_history
         SET is_current=false
         WHERE is_current AND end_at IS NOT NULL AND end_at<=now()
         RETURNING boss_user_id
       )
       INSERT INTO boss_status_history (boss_user_id,status,start_at,end_at,is_current,created_by)
       SELECT DISTINCT boss_user_id,'AVAILABLE',now(),NULL,true,boss_user_id
       FROM expired`,
    );
  }

  private async enqueueManualOutTwoHourReminders():Promise<void> {
    const result = await this.database.query<{ status_id:string; boss_user_id:string }>(
      `SELECT h.id status_id,h.boss_user_id
       FROM boss_status_history h
       WHERE h.is_current
         AND h.status='OUT'
         AND h.end_at IS NULL
         AND h.start_at<=now()-interval '2 hours'
         AND NOT EXISTS (
           SELECT 1 FROM schedule_entries s
           WHERE s.boss_user_id=h.boss_user_id
             AND s.status='ACTIVE' AND s.start_at<=now() AND s.end_at>now()
         )`,
    );
    await this.enqueue(result.rows.map(row => ({
      eventType:'MANUAL_OUT_TWO_HOUR',
      aggregateType:'boss_status_history',
      aggregateId:row.status_id,
      recipientUserId:row.boss_user_id,
      dedupeKey:`manual-out-two-hour:${row.status_id}:${row.boss_user_id}`,
      payload:{},
    })));
  }

  async enqueueScheduleParticipantChanges(scheduleId:string, addedUserIds:string[], removedUserIds:string[]):Promise<void> {
    const added = new Set(addedUserIds);
    const currentRecipients = await this.scheduleRecipients(scheduleId);
    const retainedRecipients = currentRecipients.filter(recipient => !added.has(recipient.id));
    const context = await this.database.query<{ approval_meeting_mode:string|null; boss_name:string }>(
      `SELECT s.approval_meeting_mode,u.display_name boss_name
       FROM schedule_entries s JOIN app_users u ON u.id=s.boss_user_id
       WHERE s.id=$1`,
      [scheduleId],
    );
    const meetingMode = context.rows[0]?.approval_meeting_mode ?? undefined;
    const organizer = context.rows[0]?.boss_name ?? '老板';
    const stamp = Date.now();
    await this.enqueue([
      ...retainedRecipients.map(recipient => ({
        eventType:'SCHEDULE_UPDATED',
        aggregateType:'schedule_entry',
        aggregateId:scheduleId,
        recipientUserId:recipient.id,
        dedupeKey:`schedule-participants-updated:${scheduleId}:${recipient.id}:${stamp}`,
        payload:{},
      })),
      ...addedUserIds.map(recipientUserId => ({
        eventType:'ORGANIZED_MEETING',
        aggregateType:'schedule_entry',
        aggregateId:scheduleId,
        recipientUserId,
        dedupeKey:`schedule-participant-added:${scheduleId}:${recipientUserId}:${stamp}`,
        payload:{ meetingMode, organizer },
      })),
      ...removedUserIds.map(recipientUserId => ({
        eventType:'MEETING_PARTICIPANT_REMOVED',
        aggregateType:'schedule_entry',
        aggregateId:scheduleId,
        recipientUserId,
        dedupeKey:`schedule-participant-removed:${scheduleId}:${recipientUserId}:${stamp}`,
        payload:{},
      })),
    ]);
  }

  private async enqueueUpcomingMeetingReminders(minutesBefore:number):Promise<void> {
    const eventType = minutesBefore === 30 ? 'MEETING_REMINDER_30' : 'MEETING_REMINDER_10';
    const result = await this.database.query<{ schedule_id:string; recipient_user_id:string }>(
      `WITH upcoming AS (
         SELECT s.id schedule_id, s.boss_user_id, s.source_id, s.start_at, s.end_at
         FROM schedule_entries s
         WHERE s.status='ACTIVE'
           AND s.source_type IN ('ORGANIZED_MEETING','APPROVED_REQUEST')
           AND s.start_at > now()
           AND s.start_at <= now()+($1::int * interval '1 minute')+interval '45 seconds'
           AND s.start_at > now()+($1::int * interval '1 minute')-interval '75 seconds'
       ),
       recipients AS (
         SELECT u.schedule_id, u.boss_user_id recipient_user_id FROM upcoming u
         UNION
         SELECT u.schedule_id, omp.user_id FROM upcoming u
         JOIN organized_meeting_participants omp ON omp.schedule_id=u.schedule_id
         UNION
         SELECT u.schedule_id, mr.applicant_user_id FROM upcoming u
         JOIN meeting_requests mr ON mr.id=u.source_id
         WHERE mr.status='APPROVED'
       )
       SELECT DISTINCT schedule_id, recipient_user_id
       FROM recipients`,
      [minutesBefore],
    );
    await this.enqueue(result.rows.map(row => ({
      eventType,
      aggregateType:'schedule_entry',
      aggregateId:row.schedule_id,
      recipientUserId:row.recipient_user_id,
      dedupeKey:`reminder:${minutesBefore}:${row.schedule_id}:${row.recipient_user_id}`,
      payload:{ minutesBefore },
    })));
  }

  private async expireInvalidScheduleNotifications():Promise<void> {
    await this.database.query(
      `UPDATE notification_outbox n
       SET status='FAILED',last_error=COALESCE(last_error,'manual_out_status_changed'),available_at=now()
       WHERE n.status='PENDING' AND n.event_type='MANUAL_OUT_TWO_HOUR'
         AND NOT EXISTS (
           SELECT 1 FROM boss_status_history h
           WHERE h.id=n.aggregate_id AND h.is_current AND h.status='OUT' AND h.end_at IS NULL
         )`,
    );
    await this.database.query(
      `UPDATE notification_outbox n
       SET status='FAILED',
           last_error=COALESCE(last_error,'expired_or_cancelled_schedule_notification'),
           available_at=now()
       WHERE n.status='PENDING'
         AND n.event_type NOT IN ('DAILY_SUMMARY','MANUAL_OUT_TWO_HOUR')
         AND (
           (n.event_type IN ('ORGANIZED_MEETING','REQUEST_APPROVED','REQUEST_REJECTED','REQUEST_AUTO_REJECTED','SCHEDULE_UPDATED','SCHEDULE_CANCELLED','MEETING_PARTICIPANT_REMOVED','MEETING_REMINDER_30','MEETING_REMINDER_10')
             AND n.created_at < now() - interval '30 minutes')
           OR (n.event_type <> 'SCHEDULE_CANCELLED' AND NOT (
           (n.aggregate_type='schedule_entry' AND EXISTS (
             SELECT 1 FROM schedule_entries s
             WHERE s.id=n.aggregate_id AND s.status='ACTIVE' AND s.end_at>now()
           ))
           OR
           (n.aggregate_type='MEETING_REQUEST' AND n.event_type='REQUEST_SUBMITTED' AND EXISTS (
             SELECT 1 FROM meeting_requests mr
             WHERE mr.id=n.aggregate_id AND mr.end_at>now() AND mr.status='PENDING'
           ))
           OR
           (n.aggregate_type='MEETING_REQUEST' AND EXISTS (
             SELECT 1 FROM meeting_requests mr
             WHERE mr.id=n.aggregate_id AND mr.end_at>now() AND mr.status IN ('APPROVED','REJECTED')
           ))
           ))
         )`,
    );
  }

  private async lockPendingRows(limit:number, options?:{ aggregateId?:string; eventType?:string; dedupePrefix?:string }):Promise<OutboxRow[]> {
    const result = await this.database.query<OutboxRow>(
      `WITH picked AS (
         SELECT n.id FROM notification_outbox n
         WHERE n.status='PENDING' AND n.available_at<=now()
           AND ($2::uuid IS NULL OR n.aggregate_id=$2::uuid)
           AND ($3::text IS NULL OR n.event_type=$3::text)
           AND ($4::text IS NULL OR n.dedupe_key LIKE ($4::text || '%'))
           AND (
             n.event_type='DAILY_SUMMARY'
             OR
             (n.event_type='MANUAL_OUT_TWO_HOUR'
               AND n.aggregate_type='boss_status_history' AND EXISTS (
                 SELECT 1 FROM boss_status_history h
                 WHERE h.id=n.aggregate_id AND h.is_current AND h.status='OUT' AND h.end_at IS NULL
               ))
             OR
            (n.event_type='SCHEDULE_CANCELLED'
              AND n.created_at >= now() - interval '30 minutes'
              AND n.aggregate_type='schedule_entry' AND EXISTS (
                SELECT 1 FROM schedule_entries s WHERE s.id=n.aggregate_id
              ))
             OR
             (n.event_type='REQUEST_SUBMITTED'
               AND n.aggregate_type='MEETING_REQUEST' AND EXISTS (
               SELECT 1 FROM meeting_requests mr
               WHERE mr.id=n.aggregate_id AND mr.end_at>now() AND mr.status='PENDING'
             ))
             OR
             (n.event_type IN ('ORGANIZED_MEETING','REQUEST_APPROVED','REQUEST_REJECTED','REQUEST_AUTO_REJECTED','SCHEDULE_UPDATED','SCHEDULE_CANCELLED','MEETING_PARTICIPANT_REMOVED','MEETING_REMINDER_30','MEETING_REMINDER_10')
               AND n.created_at >= now() - interval '30 minutes'
               AND n.aggregate_type='schedule_entry' AND EXISTS (
               SELECT 1 FROM schedule_entries s
               WHERE s.id=n.aggregate_id AND s.status='ACTIVE' AND s.end_at>now()
             ))
             OR
             (n.event_type IN ('ORGANIZED_MEETING','REQUEST_APPROVED','REQUEST_REJECTED','REQUEST_AUTO_REJECTED','SCHEDULE_UPDATED','SCHEDULE_CANCELLED','MEETING_PARTICIPANT_REMOVED','MEETING_REMINDER_30','MEETING_REMINDER_10')
               AND n.created_at >= now() - interval '30 minutes'
               AND n.aggregate_type='MEETING_REQUEST' AND EXISTS (
               SELECT 1 FROM meeting_requests mr
               WHERE mr.id=n.aggregate_id AND mr.end_at>now() AND mr.status IN ('APPROVED','REJECTED')
             ))
           )
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       ),
       selected AS (
         SELECT n.id,n.event_type,n.aggregate_type,n.aggregate_id,n.recipient_user_id,n.payload,n.attempts,
           u.wecom_user_id,u.display_name recipient_name,
           applicant.display_name applicant_name,
           COALESCE(mr.topic,s.title,n.payload->>'topic') topic,
           COALESCE(r.name,sr.name,n.payload->>'roomName') room_name,
           COALESCE(mr.start_at,s.start_at,(n.payload->>'startAt')::timestamptz) start_at,
           COALESCE(mr.end_at,s.end_at,(n.payload->>'endAt')::timestamptz) end_at
         FROM picked
         JOIN notification_outbox n ON n.id=picked.id
         JOIN app_users u ON u.id=n.recipient_user_id
         LEFT JOIN meeting_requests mr ON mr.id=n.aggregate_id
         LEFT JOIN app_users applicant ON applicant.id=mr.applicant_user_id
         LEFT JOIN meeting_rooms r ON r.id=mr.room_id
         LEFT JOIN schedule_entries s ON s.id=n.aggregate_id
         LEFT JOIN meeting_rooms sr ON sr.id=s.room_id
       )
       UPDATE notification_outbox n
       SET status='PROCESSING'
       FROM selected
       WHERE n.id=selected.id
       RETURNING selected.id,selected.event_type,selected.aggregate_type,selected.aggregate_id,selected.recipient_user_id,
         selected.payload,selected.attempts,selected.wecom_user_id,selected.recipient_name,
         selected.applicant_name,selected.topic,selected.room_name,selected.start_at,selected.end_at`,
      [limit, options?.aggregateId ?? null, options?.eventType ?? null, options?.dedupePrefix ?? null],
    );
    return result.rows;
  }

  private renderMessage(row:OutboxRow):string {
    if (row.event_type === 'DAILY_SUMMARY') {
      const content = typeof row.payload.content === 'string' ? row.payload.content : '';
      return content || '【石总今日日程摘要】\n\n今日无日程。';
    }
    const time = row.start_at && row.end_at
      ? `${this.formatDateTime(row.start_at)}-${this.formatTime(row.end_at)}`
      : '时间待确认';
    const room = row.room_name ? `\n会议室：${row.room_name}` : '';
    if (row.event_type === 'REQUEST_SUBMITTED') {
      if (row.payload.recipientRole === 'ADMIN') {
        const bossName = typeof row.payload.bossName === 'string' && row.payload.bossName ? row.payload.bossName : '老板';
        return `【老板日程预约】会议申请同步提醒\n预约对象：${bossName}\n申请人：${row.applicant_name || '员工'}\n时间：${time}\n会议主题：${row.topic || '未命名会议'}${room}\n请关注对应老板的审批进度。`;
      }
      return `【老板日程预约】您收到一条新的会议申请\n申请人：${row.applicant_name || '员工'}\n时间：${time}\n会议主题：${row.topic || '未命名会议'}${room}\n请进入应用审批。`;
    }
    if (row.event_type === 'REQUEST_APPROVED') {
      const mode = row.payload.meetingMode === 'REMOTE' ? '\n会议形式：远程会议' : row.payload.meetingMode === 'FACE_TO_FACE' ? '\n会议形式：面谈' : '';
      return `【Jarsking日程】你的会议申请已通过\n主题：${row.topic || '未命名会议'}\n时间：${time}${room}${mode}`;
    }
    if (row.event_type === 'REQUEST_REJECTED') {
      return `【Jarsking日程】你的会议申请已被拒绝\n主题：${row.topic || '未命名会议'}\n时间：${time}${room}`;
    }
    if (row.event_type === 'REQUEST_AUTO_REJECTED') {
      return `【Jarsking日程】你的会议申请已自动拒绝\n主题：${row.topic || '未命名会议'}\n时间：${time}${room}\n原因：老板已同意同一时段的其他申请。`;
    }
    if (row.event_type === 'ORGANIZED_MEETING') {
      const mode = row.payload.meetingMode === 'REMOTE' ? '\n会议形式：远程会议' : row.payload.meetingMode === 'FACE_TO_FACE' ? '\n会议形式：面谈' : '';
      const organizer = typeof row.payload.organizer === 'string' && row.payload.organizer ? row.payload.organizer : '老板';
      return `【Jarsking日程】${organizer}组织会议\n主题：${row.topic || '会议'}\n时间：${time}${room}${mode}\n请准时参加。`;
    }
    if (row.event_type === 'SCHEDULE_UPDATED') {
      return `【Jarsking日程】会议安排已修改\n主题：${row.topic || '会议'}\n时间：${time}${room}\n请以最新安排为准。`;
    }
    if (row.event_type === 'SCHEDULE_CANCELLED') {
      return `【Jarsking日程】会议安排已取消\n主题：${row.topic || '会议'}\n原时间：${time}${room}`;
    }
    if (row.event_type === 'MEETING_PARTICIPANT_REMOVED') {
      return `【Jarsking日程】参会安排已变更\n你已不再参加以下会议：\n主题：${row.topic || '会议'}\n原时间：${time}${room}\n如有疑问请联系会议组织人。`;
    }
    if (row.event_type === 'MANUAL_OUT_TWO_HOUR') {
      return '【老板日程预约】状态提醒\n您已外出两个小时，当前状态为外出中，是否需要更改状态？\n请进入应用确认当前状态。';
    }
    if (row.event_type === 'MEETING_REMINDER_30' || row.event_type === 'MEETING_REMINDER_10') {
      const minutes = row.event_type === 'MEETING_REMINDER_30' ? '30' : '10';
      return `【Jarsking日程】会前${minutes}分钟提醒\n主题：${row.topic || '会议'}\n时间：${time}${room}\n请提前准备。`;
    }
    return `【Jarsking日程】你有一条新的日程提醒\n类型：${row.event_type}\n时间：${time}`;
  }

  private async createInboxEntry(row:OutboxRow):Promise<void> {
    const message = this.renderMessage(row);
    const [title, ...detailLines] = message.split('\n');
    const inboxTitle = (title || 'Jarsking日程').replace(/[【】]/g,'');
    await this.database.query(
      `INSERT INTO notification_inbox
       (source_outbox_id,event_type,aggregate_type,aggregate_id,recipient_user_id,title,detail,payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (source_outbox_id) DO NOTHING`,
      [row.id,row.event_type,row.aggregate_type,row.aggregate_id,row.recipient_user_id,inboxTitle,detailLines.join('\n'),JSON.stringify(row.payload ?? {})],
    );
  }

  private async scheduleRecipients(scheduleId:string):Promise<Array<{id:string}>> {
    const result = await this.database.query<{ id:string }>(
      `SELECT DISTINCT id FROM (
         SELECT s.boss_user_id id FROM schedule_entries s WHERE s.id=$1
         UNION
         SELECT omp.user_id FROM organized_meeting_participants omp WHERE omp.schedule_id=$1
         UNION
         SELECT mr.applicant_user_id FROM schedule_entries s
         JOIN meeting_requests mr ON mr.id=s.source_id
         WHERE s.id=$1 AND s.source_type='APPROVED_REQUEST'
       ) recipients`,
      [scheduleId],
    );
    return result.rows;
  }

  private formatDateTime(date:Date):string {
    return date.toLocaleString('zh-CN',{ timeZone:'Asia/Shanghai', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
  }

  private formatTime(date:Date):string {
    return date.toLocaleTimeString('zh-CN',{ timeZone:'Asia/Shanghai', hour:'2-digit', minute:'2-digit', hour12:false });
  }
}
