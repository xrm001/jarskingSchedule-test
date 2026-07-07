import { BadRequestException, Injectable } from '@nestjs/common';
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
export class NotificationService {
  constructor(private readonly database:DatabaseService, private readonly wecom:WeComClientService) {}

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
    const rows = await this.lockPendingRows(Math.max(1, Math.min(limit, 100)));
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

  private async lockPendingRows(limit:number):Promise<OutboxRow[]> {
    const result = await this.database.query<OutboxRow>(
      `WITH picked AS (
         SELECT id FROM notification_outbox
         WHERE status IN ('PENDING','FAILED') AND available_at<=now()
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
      [limit],
    );
    return result.rows;
  }

  private renderMessage(row:OutboxRow):string {
    const time = row.start_at && row.end_at
      ? `${this.formatDateTime(row.start_at)}-${this.formatTime(row.end_at)}`
      : '时间待确认';
    const room = row.room_name ? `\n会议室：${row.room_name}` : '';
    if (row.event_type === 'REQUEST_APPROVED') {
      return `【Jarsking日程】你的会议申请已通过\n主题：${row.topic || '未命名会议'}\n时间：${time}${room}`;
    }
    if (row.event_type === 'REQUEST_REJECTED') {
      return `【Jarsking日程】你的会议申请已被拒绝\n主题：${row.topic || '未命名会议'}\n时间：${time}${room}`;
    }
    if (row.event_type === 'REQUEST_AUTO_REJECTED') {
      return `【Jarsking日程】你的会议申请已自动拒绝\n主题：${row.topic || '未命名会议'}\n时间：${time}${room}\n原因：老板已同意同一时段的其他申请。`;
    }
    if (row.event_type === 'ORGANIZED_MEETING') {
      return `【Jarsking日程】石总组织会议\n主题：${row.topic || '会议'}\n时间：${time}${room}\n请准时参加。`;
    }
    return `【Jarsking日程】你有一条新的日程提醒\n类型：${row.event_type}\n时间：${time}`;
  }

  private formatDateTime(date:Date):string {
    return date.toLocaleString('zh-CN',{ timeZone:'Asia/Shanghai', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
  }

  private formatTime(date:Date):string {
    return date.toLocaleTimeString('zh-CN',{ timeZone:'Asia/Shanghai', hour:'2-digit', minute:'2-digit', hour12:false });
  }
}
