import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import type { AuthenticatedUser } from '../../domain/model';
import { DatabaseService } from '../database/database.service';
import { NotificationService } from '../notifications/notification.service';

type JsonObject = Record<string, unknown>;

@Injectable()
export class BusinessService {
  constructor(private readonly database: DatabaseService, @Optional() private readonly notifications?: NotificationService) {}

  async bossToday(actor: AuthenticatedUser) {
    const bossId = await this.effectiveBossId(actor);
    const result = await this.database.query<{
      id:string; title:string|null; start_at:Date; end_at:Date; source_type:string;
      visibility:string; room_name:string|null; participant_names:string[]|null; meeting_content:string|null;
    }>(
      `SELECT s.id,s.title,s.meeting_content,s.start_at,s.end_at,s.source_type,s.visibility,r.name room_name,
              COALESCE(participants.names, ARRAY[]::text[]) participant_names
      FROM schedule_entries s LEFT JOIN meeting_rooms r ON r.id=s.room_id
      LEFT JOIN LATERAL (
         SELECT array_agg(name ORDER BY name) names
         FROM (
           SELECT DISTINCT u.display_name name
           FROM (
             SELECT omp.user_id
             FROM organized_meeting_participants omp
             WHERE omp.schedule_id=s.id
             UNION
             SELECT n.recipient_user_id user_id
             FROM notification_outbox n
             WHERE n.aggregate_type='schedule_entry'
               AND n.aggregate_id=s.id
               AND n.event_type='ORGANIZED_MEETING'
             UNION
             SELECT mr.applicant_user_id
             FROM meeting_requests mr
             WHERE mr.id=s.source_id
               AND s.source_type='APPROVED_REQUEST'
             UNION
             SELECT mp.user_id
             FROM meeting_participants mp
             WHERE mp.request_id=s.source_id
           ) p
           JOIN app_users u ON u.id=p.user_id
           WHERE u.removed_at IS NULL
         ) names
       ) participants ON true
       WHERE s.boss_user_id=$1 AND s.status='ACTIVE'
         AND s.start_at < ((current_date+1)::timestamp AT TIME ZONE 'Asia/Shanghai')
         AND s.end_at > (current_date::timestamp AT TIME ZONE 'Asia/Shanghai')
       ORDER BY s.start_at`, [bossId],
    );
    return result.rows.map(row => ({
      id:row.id, title:row.title || (row.source_type === 'PERSONAL' ? '个人行程' : '已占用'),
      start:this.time(row.start_at), end:this.time(row.end_at),
      type:row.source_type === 'PERSONAL' ? 'personal' : row.source_type === 'STATUS_BLOCK' ? 'out' : 'meeting',
      location:row.room_name ?? undefined,
      visibility:row.visibility === 'BOSS_ONLY' ? 'private' : 'management',
      participants:row.participant_names ?? [],
      content:row.meeting_content ?? undefined,
    }));
  }

  async bossApprovals(actor: AuthenticatedUser) {
    const bossId = await this.effectiveBossId(actor);
    const result = await this.database.query<{
      id:string; applicant:string; department:string|null; topic:string; room:string|null;
      start_at:Date; end_at:Date; created_at:Date; status:string; version:number; approval_meeting_mode:string|null;
    }>(
      `SELECT mr.id,u.display_name applicant,u.department,mr.topic,r.name room,
              mr.start_at,mr.end_at,mr.created_at,mr.status,mr.version,mr.approval_meeting_mode
       FROM meeting_requests mr JOIN app_users u ON u.id=mr.applicant_user_id
       LEFT JOIN meeting_rooms r ON r.id=mr.room_id
       WHERE mr.boss_user_id=$1 AND mr.status IN ('PENDING','APPROVED','REJECTED')
         AND mr.start_at>now()-interval '7 days'
       ORDER BY mr.start_at,mr.created_at`, [bossId],
    );
    const groups = new Map<string, { id:string; start:string; end:string; applications:unknown[] }>();
    for (const row of result.rows) {
      const key = `${row.start_at.toISOString()}-${row.end_at.toISOString()}`;
      const group = groups.get(key) ?? { id:key, start:this.time(row.start_at), end:this.time(row.end_at), applications:[] };
      group.applications.push({
        id:row.id, applicant:row.applicant, department:row.department || '', topic:row.topic,
        room:row.room || '未选择会议室', start:this.time(row.start_at), end:this.time(row.end_at),
        submittedAt:this.dateTimeLabel(row.created_at), status:row.status.toLowerCase(), version:row.version,
        meetingMode:row.approval_meeting_mode ?? undefined,
      });
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  async createPersonalSchedule(actor: AuthenticatedUser, body: JsonObject) {
    const scheduleType = String(body.type || 'personal');
    const fallbackTitle = scheduleType === 'out' ? '外出' : scheduleType === 'meeting' ? '会议' : '个人行程';
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : fallbackTitle;
    const startAt = this.dateTime(body.startAt ?? body.start, '开始时间');
    const endAt = this.dateTime(body.endAt ?? body.end, '结束时间');
    if (endAt <= startAt) throw new BadRequestException({ code:'INVALID_TIME_RANGE', message:'结束时间必须晚于开始时间' });
    const visibility = body.visibility === 'private' || body.visibility === 'BOSS_ONLY' ? 'BOSS_ONLY' : 'ALL_MEMBERS';
    try {
      const result = await this.database.query<{ id:string }>(
        `INSERT INTO schedule_entries
         (boss_user_id,source_type,title,start_at,end_at,visibility,status,created_by)
         VALUES ($1,'PERSONAL',$2,$3,$4,$5,'ACTIVE',$1) RETURNING id`,
        [actor.id,title,startAt,endAt,visibility],
      );
      const id = result.rows[0]!.id;
      await this.markVoiceExecuted(actor, body.voiceCommandId, 'schedule_entry', id, { action:'create_personal_schedule' });
      await this.audit(actor,'CREATE_PERSONAL_SCHEDULE','schedule_entry',id,null,{ title,startAt,endAt,visibility,type:body.type || 'personal' });
      return { id, title, start:this.time(startAt), end:this.time(endAt), type:body.type || 'personal', visibility:body.visibility || 'management' };
    } catch (error) {
      if ((error as { code?:string }).code === '23P01') throw new ConflictException({ code:'SCHEDULE_CONFLICT', message:'该时段已有行程' });
      throw error;
    }
  }

  async changeBossStatus(actor: AuthenticatedUser, body: JsonObject) {
    const map:Record<string,string> = { available:'AVAILABLE', meeting:'MEETING', out:'OUT', dnd:'DND' };
    const status = map[String(body.status)];
    if (!status) throw new BadRequestException({ code:'INVALID_STATUS', message:'状态无效' });
    const duration = body.durationMinutes == null ? null : Number(body.durationMinutes);
    if (duration !== null && (!Number.isFinite(duration) || duration <= 0 || duration > 1440)) {
      throw new BadRequestException({ code:'INVALID_DURATION', message:'状态时长无效' });
    }
    await this.database.transaction(async client => {
      await client.query('UPDATE boss_status_history SET is_current=false,end_at=COALESCE(end_at,now()) WHERE boss_user_id=$1 AND is_current', [actor.id]);
      await client.query(
        `INSERT INTO boss_status_history (boss_user_id,status,start_at,end_at,is_current,created_by)
         VALUES ($1,$2,now(),CASE WHEN $3::int IS NULL THEN NULL ELSE now()+($3*interval '1 minute') END,true,$1)`,
        [actor.id,status,duration],
      );
      await client.query(
        `UPDATE schedule_entries SET status='CANCELLED',updated_at=now()
         WHERE boss_user_id=$1 AND source_type='STATUS_BLOCK' AND status='ACTIVE' AND end_at>now()`,
        [actor.id],
      );
      if (duration && (status === 'MEETING' || status === 'OUT')) {
        await client.query(
          `INSERT INTO schedule_entries
           (boss_user_id,source_type,title,start_at,end_at,visibility,status,created_by)
           VALUES ($1,'STATUS_BLOCK',$2,now(),now()+($3*interval '1 minute'),'ALL_MEMBERS','ACTIVE',$1)`,
          [actor.id,status === 'MEETING' ? '会议中' : '外出中',duration],
        );
      }
    });
    await this.markVoiceExecuted(actor, body.voiceCommandId, 'boss_status_history', actor.id, { action:'change_boss_status', status, duration });
    await this.audit(actor,'CHANGE_BOSS_STATUS','boss_status',actor.id,null,{ status,duration });
    return { ok:true };
  }

  async organizeMeeting(actor: AuthenticatedUser, body: JsonObject) {
    const topic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim() : '会谈';
    const startAt = this.dateTime(body.startAt, '会议开始时间');
    const roomId = typeof body.roomId === 'string' && body.roomId.trim() ? body.roomId.trim() : null;
    const meetingMode = body.meetingMode === 'REMOTE' ? 'REMOTE' : 'FACE_TO_FACE';
    const durationMinutes = Number(body.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
      throw new BadRequestException({ code:'INVALID_DURATION', message:'会议时长无效' });
    }
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    this.validateBookingHours(startAt,endAt);
    const participantIds = Array.isArray(body.participantIds)
      ? [...new Set(body.participantIds.filter(id => typeof id === 'string'))] as string[]
      : [];
    if (!participantIds.length) throw new BadRequestException({ code:'PARTICIPANTS_REQUIRED', message:'请选择参会人员' });
    const participantResult = await this.database.query<{ id:string; display_name:string }>(
      `SELECT u.id,u.display_name FROM app_users u
       WHERE u.id=ANY($1::uuid[]) AND u.status='ACTIVE' AND u.removed_at IS NULL
         AND u.wecom_user_id IS NOT NULL AND btrim(u.wecom_user_id)<>''
         AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('BOSS','BOSS_VIEWER'))`,
      [participantIds],
    );
    if (participantResult.rows.length !== participantIds.length) {
      throw new BadRequestException({ code:'INVALID_PARTICIPANTS', message:'参会人员中包含无效、不可选择或未绑定企微 user_id 的成员' });
    }
    let roomName: string | null = null;
    if (roomId) {
      const room = await this.database.query<{ name:string }>('SELECT name FROM meeting_rooms WHERE id=$1 AND enabled', [roomId]);
      if (!room.rowCount) throw new NotFoundException({ code:'ROOM_NOT_FOUND', message:'会议室不存在或已停用' });
      roomName = room.rows[0]!.name;
    }
    try {
      const schedule = await this.database.transaction(async client => {
        const result = await client.query<{ id:string }>(
          `INSERT INTO schedule_entries
           (boss_user_id,room_id,source_type,title,meeting_content,start_at,end_at,visibility,status,created_by,approval_meeting_mode)
           VALUES ($1,$2,'ORGANIZED_MEETING',$3,$3,$4,$5,'ALL_MEMBERS','ACTIVE',$1,$6)
           RETURNING id`,
          [actor.id,roomId,topic,startAt,endAt,meetingMode],
        );
        const scheduleId = result.rows[0]!.id;
        for (const participant of participantResult.rows) {
          await client.query(
            `INSERT INTO organized_meeting_participants (schedule_id,user_id,participant_type)
             VALUES ($1,$2,'ATTENDEE') ON CONFLICT DO NOTHING`,
            [scheduleId,participant.id],
          );
          await client.query(
            `INSERT INTO notification_outbox
             (event_type,aggregate_type,aggregate_id,recipient_user_id,dedupe_key,payload)
             VALUES ('ORGANIZED_MEETING','schedule_entry',$1,$2,$3,$4)
             ON CONFLICT (dedupe_key) DO NOTHING`,
            [scheduleId,participant.id,`organized:${scheduleId}:${participant.id}`,JSON.stringify({
              topic,startAt:startAt.toISOString(),endAt:endAt.toISOString(),roomName,organizer:actor.name || '石总',meetingMode,
            })],
          );
        }
        return { id:scheduleId };
      });
      const delivery = await this.notifications?.processPendingForAggregate(schedule.id, participantIds.length);
      await this.markVoiceExecuted(actor, body.voiceCommandId, 'schedule_entry', schedule.id, { action:'organize_meeting', participantIds, meetingMode });
      await this.audit(actor,'ORGANIZE_MEETING','schedule_entry',schedule.id,null,{ topic,startAt,endAt,roomId,participantIds,meetingMode });
      return {
        id:schedule.id,title:topic,start:this.time(startAt),end:this.time(endAt),type:'meeting',visibility:'management',
        location:roomName ?? undefined,
        participants:participantResult.rows.map(item => item.display_name),
        content:topic,
        notifications:delivery ?? { picked:0,sent:0,failed:0 },
      };
    } catch (error) {
      if ((error as { code?:string }).code === '23P01') throw new ConflictException({ code:'SCHEDULE_CONFLICT', message:'该时段已有行程' });
      throw error;
    }
  }

  async currentBossStatus() {
    const active = await this.database.query<{ id:string; source_type:string; title:string|null; start_at:Date; end_at:Date }>(
      `SELECT s.id,s.source_type,s.title,s.start_at,s.end_at
       FROM schedule_entries s
       JOIN user_roles r ON r.user_id=s.boss_user_id AND r.role='BOSS'
       WHERE s.status='ACTIVE' AND s.start_at<=now() AND s.end_at>now()
       ORDER BY s.start_at DESC LIMIT 1`,
    );
    if (active.rows[0]) {
      const row = active.rows[0];
      const meeting = row.source_type === 'ORGANIZED_MEETING' || row.source_type === 'APPROVED_REQUEST';
      return {
        status: meeting ? 'meeting' : 'out',
        label: meeting ? '会议中' : '外出中',
        start:this.time(row.start_at),
        end:this.time(row.end_at),
        available:false,
        scheduleId:row.id,
        sourceType:row.source_type,
      };
    }
    const result = await this.database.query<{ status:string; start_at:Date; end_at:Date|null }>(
      `SELECT b.status,b.start_at,b.end_at FROM boss_status_history b
       JOIN user_roles r ON r.user_id=b.boss_user_id AND r.role='BOSS'
       WHERE b.is_current ORDER BY b.created_at DESC LIMIT 1`,
    );
    const row = result.rows[0];
    if (!row) return { status:'available', label:'有空', start:null, end:null, available:true };
    if (row.end_at && row.end_at <= new Date()) return { status:'available', label:'有空', start:null, end:null, available:true };
    const labels:Record<string,string> = { AVAILABLE:'有空',MEETING:'会议中',OUT:'外出中',DND:'勿扰' };
    return { status:row.status.toLowerCase(),label:labels[row.status] || row.status,start:this.time(row.start_at),end:row.end_at ? this.time(row.end_at) : null,available:row.status === 'AVAILABLE' };
  }

  async updateBossSchedule(actor: AuthenticatedUser, scheduleId: string, body: JsonObject) {
    const existing = await this.database.query<{ id:string; source_type:string }>(
      `SELECT id,source_type FROM schedule_entries
       WHERE id=$1 AND boss_user_id=$2 AND status='ACTIVE'`,
      [scheduleId,actor.id],
    );
    if (!existing.rowCount) throw new NotFoundException({ code:'SCHEDULE_NOT_FOUND', message:'日程不存在或已取消' });

    const title = this.text(body.title ?? body.topic, '日程内容');
    const startAt = this.dateTime(body.startAt, '开始时间');
    const endAt = this.dateTime(body.endAt, '结束时间');
    if (endAt <= startAt) throw new BadRequestException({ code:'INVALID_TIME_RANGE', message:'结束时间必须晚于开始时间' });
    const roomId = typeof body.roomId === 'string' && body.roomId.trim() ? body.roomId.trim() : null;
    const visibility = body.visibility === 'private' || body.visibility === 'BOSS_ONLY' ? 'BOSS_ONLY' : 'ALL_MEMBERS';
    const type = String(existing.rows[0]!.source_type);
    if (roomId) {
      const room = await this.database.query<{ name:string }>('SELECT name FROM meeting_rooms WHERE id=$1 AND enabled', [roomId]);
      if (!room.rowCount) throw new NotFoundException({ code:'ROOM_NOT_FOUND', message:'会议室不存在或已停用' });
    }
    try {
      const before = await this.database.query(`SELECT * FROM schedule_entries WHERE id=$1 AND boss_user_id=$2`, [scheduleId,actor.id]);
      const result = await this.database.query<{ id:string; room_name:string|null }>(
        `UPDATE schedule_entries s
         SET title=$3, meeting_content=CASE WHEN source_type IN ('ORGANIZED_MEETING','APPROVED_REQUEST') THEN $3 ELSE meeting_content END,
             start_at=$4, end_at=$5, room_id=$6, visibility=$7, updated_at=now()
         FROM (SELECT $1::uuid id) target
         LEFT JOIN meeting_rooms r ON r.id=$6
         WHERE s.id=target.id AND s.boss_user_id=$2 AND s.status='ACTIVE'
         RETURNING s.id,r.name room_name`,
        [scheduleId,actor.id,title,startAt,endAt,roomId,visibility],
      );
      if (!result.rowCount) throw new NotFoundException({ code:'SCHEDULE_NOT_FOUND', message:'日程不存在或已取消' });
      await this.notifications?.enqueueScheduleChange(scheduleId, 'SCHEDULE_UPDATED');
      await this.notifications?.processPendingForAggregate(scheduleId, 50);
      await this.markVoiceExecuted(actor, body.voiceCommandId, 'schedule_entry', scheduleId, { action:'update_schedule' });
      await this.audit(actor,'UPDATE_BOSS_SCHEDULE','schedule_entry',scheduleId,before.rows[0] ?? null,{ title,startAt,endAt,roomId,visibility });
      return {
        id:result.rows[0]!.id,
        title,
        start:this.time(startAt),
        end:this.time(endAt),
        type:type === 'PERSONAL' ? 'personal' : type === 'STATUS_BLOCK' ? 'out' : 'meeting',
        location:result.rows[0]!.room_name ?? undefined,
        visibility:visibility === 'BOSS_ONLY' ? 'private' : 'management',
        content:title,
      };
    } catch (error) {
      if ((error as { code?:string }).code === '23P01') throw new ConflictException({ code:'SCHEDULE_CONFLICT', message:'该时段已有行程或会议室已被占用' });
      throw error;
    }
  }

  async cancelBossSchedule(actor: AuthenticatedUser, scheduleId: string) {
    const before = await this.database.query(`SELECT * FROM schedule_entries WHERE id=$1 AND boss_user_id=$2`, [scheduleId,actor.id]);
    const result = await this.database.query(
      `UPDATE schedule_entries SET status='CANCELLED',updated_at=now()
       WHERE id=$1 AND boss_user_id=$2 AND status='ACTIVE' RETURNING id`,
      [scheduleId,actor.id],
    );
    if (!result.rowCount) throw new NotFoundException({ code:'SCHEDULE_NOT_FOUND', message:'日程不存在或已取消' });
    try {
      await this.notifications?.enqueueScheduleChange(scheduleId, 'SCHEDULE_CANCELLED');
      await this.notifications?.processPendingForAggregate(scheduleId, 50);
    } catch {
      // 取消日程本身已经成功，通知通道的短暂失败交给后台重试/人工排查，
      // 不应让前端误以为取消失败。
    }
    await this.audit(actor,'CANCEL_BOSS_SCHEDULE','schedule_entry',scheduleId,before.rows[0] ?? null,{ status:'CANCELLED' });
    return { ok:true };
  }

  async createMeetingRequest(actor: AuthenticatedUser, body: JsonObject) {
    const bossId = await this.bossId();
    const topic = this.text(body.topic, '会议主题');
    const roomId = this.text(body.roomId, '会议室');
    const startAt = this.dateTime(body.startAt, '开始时间');
    const endAt = this.dateTime(body.endAt, '结束时间');
    if (endAt <= startAt) throw new BadRequestException({ code:'INVALID_TIME_RANGE', message:'结束时间必须晚于开始时间' });
    this.validateBookingHours(startAt,endAt);
    const room = await this.database.query('SELECT 1 FROM meeting_rooms WHERE id=$1 AND enabled', [roomId]);
    if (!room.rowCount) throw new NotFoundException({ code:'ROOM_NOT_FOUND', message:'会议室不存在或已停用' });
    const visibility = body.visibility === 'private' || body.visibility === 'BOSS_ONLY' ? 'BOSS_ONLY' : 'ALL_MEMBERS';
    const result = await this.database.query<{ id:string; version:number }>(
      `INSERT INTO meeting_requests
       (boss_user_id,applicant_user_id,room_id,topic,meeting_content,start_at,end_at,visibility)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,version`,
      [bossId,actor.id,roomId,topic,typeof body.meetingContent === 'string' ? body.meetingContent : null,startAt,endAt,visibility],
    );
    await this.audit(actor,'CREATE_MEETING_REQUEST','meeting_request',result.rows[0]!.id,null,{ bossId,roomId,topic,startAt,endAt,visibility });
    return { id:result.rows[0]!.id, version:result.rows[0]!.version, status:'pending' };
  }

  async myRequests(actor: AuthenticatedUser) {
    const result = await this.database.query(
      `SELECT mr.id,mr.topic,mr.start_at AS "startAt",mr.end_at AS "endAt",r.name room,
              lower(mr.status::text) status,mr.version
       FROM meeting_requests mr LEFT JOIN meeting_rooms r ON r.id=mr.room_id
       WHERE mr.applicant_user_id=$1 ORDER BY mr.created_at DESC LIMIT 100`, [actor.id],
    );
    return result.rows;
  }

  async cancelRequest(actor: AuthenticatedUser, requestId: string) {
    const result = await this.database.query(
      `UPDATE meeting_requests SET status='CANCELLED',version=version+1,updated_at=now()
       WHERE id=$1 AND applicant_user_id=$2 AND status='PENDING' RETURNING id`, [requestId,actor.id],
    );
    if (!result.rowCount) throw new ConflictException({ code:'REQUEST_NOT_CANCELLABLE', message:'申请不存在或已处理' });
    await this.audit(actor,'CANCEL_MEETING_REQUEST','meeting_request',requestId,null,{ status:'CANCELLED' });
    return { ok:true };
  }

  async adminRequests() {
    const result = await this.database.query(
      `SELECT mr.id,u.display_name applicant,mr.topic,mr.start_at AS "startAt",mr.end_at AS "endAt",
              r.name room,lower(mr.status::text) status
       FROM meeting_requests mr JOIN app_users u ON u.id=mr.applicant_user_id
       LEFT JOIN meeting_rooms r ON r.id=mr.room_id ORDER BY mr.created_at DESC LIMIT 200`,
    );
    return result.rows;
  }

  async reminders(actor: AuthenticatedUser) {
    const result = await this.database.query<{ id:string; title:string; detail:string|null; created_at:Date; read_at:Date|null }>(
      `SELECT id,title,detail,created_at,read_at FROM notification_inbox
       WHERE recipient_user_id=$1 ORDER BY created_at DESC LIMIT 50`, [actor.id],
    );
    return result.rows.map(row => ({ id:row.id, title:row.title, detail:row.detail || '系统业务提醒', time:row.created_at.toISOString(), read:row.read_at !== null }));
  }

  async markRemindersRead(actor: AuthenticatedUser) {
    await this.database.query(`UPDATE notification_inbox SET read_at=COALESCE(read_at,now()) WHERE recipient_user_id=$1 AND read_at IS NULL`, [actor.id]);
    return { ok:true };
  }

  private async bossId(): Promise<string> {
    const result = await this.database.query<{ id:string }>(
      `SELECT u.id FROM app_users u JOIN user_roles r ON r.user_id=u.id
       WHERE r.role='BOSS' AND u.status='ACTIVE' AND u.removed_at IS NULL LIMIT 1`,
    );
    if (!result.rows[0]) throw new NotFoundException({ code:'BOSS_NOT_FOUND', message:'未配置老板账号' });
    return result.rows[0].id;
  }

  private async effectiveBossId(actor: AuthenticatedUser): Promise<string> {
    return actor.roles.includes('BOSS') ? actor.id : this.bossId();
  }

  private text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException({ code:'FIELD_REQUIRED', message:`请填写${label}` });
    return value.trim();
  }

  private dateTime(value: unknown, label: string): Date {
    if (typeof value !== 'string') throw new BadRequestException({ code:'INVALID_DATETIME', message:`${label}无效` });
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException({ code:'INVALID_DATETIME', message:`${label}无效` });
    return date;
  }

  private validateBookingHours(startAt:Date,endAt:Date):void {
    const formatter = new Intl.DateTimeFormat('en-CA',{ timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false });
    const weekdayFormatter = new Intl.DateTimeFormat('en-US',{ timeZone:'Asia/Shanghai',weekday:'short' });
    const parts = (date:Date) => Object.fromEntries(formatter.formatToParts(date).map(part => [part.type,part.value]));
    const start=parts(startAt), end=parts(endAt);
    const startDay=`${start.year}-${start.month}-${start.day}`, endDay=`${end.year}-${end.month}-${end.day}`;
    const startTime=`${start.hour}:${start.minute}`, endTime=`${end.hour}:${end.minute}`;
    if (weekdayFormatter.format(startAt) === 'Sun') {
      throw new BadRequestException({ code:'SUNDAY_NOT_BOOKABLE', message:'周日为休息日，不可预约' });
    }
    if(startDay!==endDay || startTime<'09:00' || endTime>'19:00') {
      throw new BadRequestException({ code:'OUTSIDE_BOOKING_HOURS', message:'可预约时间为同一天09:00至19:00' });
    }
  }

  private time(value: Date): string { return value.toLocaleTimeString('zh-CN',{ hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Shanghai' }); }
  private dateTimeLabel(value: Date): string {
    return value.toLocaleString('zh-CN',{
      timeZone:'Asia/Shanghai', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false,
    });
  }
  private async markVoiceExecuted(actor:AuthenticatedUser, value:unknown, entityType:string, entityId:string, payload:Record<string,unknown>):Promise<void> {
    if (typeof value !== 'string' || !value) return;
    await this.database.query(
      `UPDATE voice_commands
       SET confirmation_status='EXECUTED', executed_at=now(), executed_entity_type=$3,
           executed_entity_id=$4, execution_payload=$5, execution_error=NULL
       WHERE id=$1 AND user_id=$2`,
      [value,actor.id,entityType,entityId,JSON.stringify(payload)],
    );
  }

  private async audit(actor:AuthenticatedUser, action:string, entityType:string, entityId:string, beforeData:unknown, afterData:unknown):Promise<void> {
    await this.database.query(
      `INSERT INTO audit_logs (actor_user_id,action,entity_type,entity_id,before_data,after_data)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [actor.id,action,entityType,entityId,JSON.stringify(beforeData ?? null),JSON.stringify(afterData ?? null)],
    );
  }
}
