import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser, UserRole } from '../../domain/model';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ResourcesService {
  constructor(private readonly database: DatabaseService) {}

  private readonly memberOrderSql = `
    CASE u.wecom_user_id
      WHEN 'andyshi@jxpack' THEN 1
      WHEN 'sophie' THEN 2
      WHEN 'XuJian' THEN 3
      WHEN 'LongJiHua' THEN 4
      WHEN 'WangJiang' THEN 5
      WHEN 'ChenXiaoLing' THEN 6
      WHEN 'TangYanTao' THEN 7
      WHEN 'YangYang' THEN 8
      WHEN 'jxCaiWuJingLileo' THEN 9
      WHEN 'teresa-jx' THEN 10
      WHEN 'FengChengHuangJiaXingpmcZhuGuan' THEN 11
      WHEN '3507fe88f124331ad752a96abe995ca2' THEN 12
      WHEN 'JiaXingWuXiaoJie' THEN 13
      WHEN 'LuYongPing' THEN 14
      WHEN 'AiLingailing' THEN 15
      WHEN 'kenny' THEN 16
      ELSE 999
    END`;

  async listManagement() {
    return this.listEmployees();
  }

  async listEmployees() {
    const result = await this.database.query(
      `SELECT u.id, u.wecom_user_id AS "wecomUserId", u.display_name AS "displayName",
              u.job_title AS "jobTitle", u.department,
              array_remove(array_agg(DISTINCT r.role ORDER BY r.role), NULL)::text[] AS roles,
              (${this.memberOrderSql}) < 999 AS "isPrimaryMeetingTarget",
              (u.wecom_user_id IS NOT NULL AND btrim(u.wecom_user_id)<>'') AS "messageAvailable",
              CASE
                WHEN u.wecom_user_id IS NULL OR btrim(u.wecom_user_id)='' THEN '缺少企微 user_id，无法发送提醒'
                ELSE NULL
              END AS "messageUnavailableReason"
       FROM app_users u
       LEFT JOIN user_roles r ON r.user_id=u.id
       WHERE u.status = 'ACTIVE' AND u.removed_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='BOSS')
         AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='BOSS_VIEWER')
       GROUP BY u.id, u.wecom_user_id, u.display_name, u.job_title, u.department, u.created_at
       ORDER BY ${this.memberOrderSql}, u.created_at, u.display_name`,
    );
    return result.rows;
  }

  async listMembers() {
    const result = await this.database.query(
      `SELECT u.id, u.wecom_user_id AS "wecomUserId", u.display_name AS "displayName", u.job_title AS "jobTitle",
              u.department, u.wecom_user_id IS NOT NULL AS "wecomBound",
              array_agg(r.role ORDER BY r.role)::text[] AS roles
       FROM app_users u
       JOIN user_roles r ON r.user_id=u.id
       WHERE u.status='ACTIVE' AND u.removed_at IS NULL
       GROUP BY u.id, u.display_name, u.job_title, u.department, u.wecom_user_id
       ORDER BY ${this.memberOrderSql}, u.created_at, u.display_name`,
    );
    return result.rows;
  }

  async listRooms() {
    const result = await this.database.query(
      `SELECT id, name, floor, capacity, equipment
       FROM meeting_rooms WHERE enabled
       ORDER BY CASE
          WHEN name LIKE '%老板办公室%' OR name LIKE '%会客室%' THEN 1
          WHEN name LIKE '%大会议室%' THEN 2
          ELSE 10
        END, floor, name`,
    );
    return result.rows;
  }

  async listAllRooms() {
    const result = await this.database.query(
      `SELECT id,name,floor,capacity,equipment,enabled FROM meeting_rooms ORDER BY floor,name`,
    );
    return result.rows;
  }

  async roomAvailability(date:string,start:string,end:string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start>=end) {
      throw new BadRequestException({ code:'INVALID_TIME_RANGE', message:'查询时段无效' });
    }
    const startAt=`${date}T${start}:00+08:00`, endAt=`${date}T${end}:00+08:00`;
    const result = await this.database.query(
      `SELECT r.id,r.name,r.floor,r.capacity,r.equipment,
              NOT EXISTS (
                SELECT 1 FROM schedule_entries s
                WHERE s.room_id=r.id AND s.status='ACTIVE'
                  AND tstzrange(s.start_at,s.end_at,'[)') && tstzrange($1::timestamptz,$2::timestamptz,'[)')
              ) AS available
       FROM meeting_rooms r
       WHERE r.enabled AND r.name NOT LIKE '%老板办公室%' AND r.name NOT LIKE '%会客室%'
       ORDER BY CASE WHEN r.name LIKE '%大会议室%' THEN 1 ELSE 10 END, r.floor,r.name`,
      [startAt,endAt],
    );
    return result.rows;
  }

  async addMember(body:Record<string,unknown>, actor:AuthenticatedUser) {
    const name = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const wecomUserId = typeof body.wecomUserId === 'string' ? body.wecomUserId.trim() : '';
    const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() : '';
    const department = typeof body.department === 'string' ? body.department.trim() : '';
    const role = this.normalizeRole(body.role);
    if (!name || !department) throw new BadRequestException({ code:'MEMBER_FIELDS_REQUIRED', message:'请填写姓名和部门' });
    if (!role || role === 'BOSS') throw new BadRequestException({ code:'INVALID_ROLE', message:'新增成员角色无效' });
    return this.database.transaction(async client => {
      const existing = wecomUserId ? await client.query<{id:string}>(
        `SELECT id FROM app_users WHERE wecom_user_id=$1 LIMIT 1`,
        [wecomUserId],
      ) : { rows:[] };
      const user = existing.rows[0]
        ? await client.query<{id:string}>(
          `UPDATE app_users
           SET display_name=$2, job_title=NULLIF($3,''), department=$4, status='ACTIVE', source='MANUAL', removed_at=NULL
           WHERE id=$1 RETURNING id`,
          [existing.rows[0].id,name,jobTitle,department],
        )
        : await client.query<{id:string}>(
          `INSERT INTO app_users (wecom_user_id,display_name,job_title,department,status,source)
           VALUES (NULLIF($1,''),$2,NULLIF($3,''),$4,'ACTIVE','MANUAL') RETURNING id`,
          [wecomUserId,name,jobTitle,department],
        );
      await client.query(`DELETE FROM user_roles WHERE user_id=$1 AND role IN ('MANAGEMENT','ADMIN')`,[user.rows[0]!.id]);
      await client.query('INSERT INTO user_roles (user_id,role,granted_by) VALUES ($1,$2,$3)',[user.rows[0]!.id,role,actor.id]);
      return { id:user.rows[0]!.id,wecomUserId:wecomUserId || null,displayName:name,jobTitle:jobTitle || null,department,roles:[role],wecomBound:Boolean(wecomUserId) };
    });
  }

  private cleanText(value:unknown) {
    return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
  }

  private normalizeRole(value:unknown):UserRole | null {
    const raw = this.cleanText(value).toUpperCase();
    if (!raw || raw === '员工'.toUpperCase() || raw === '管理层'.toUpperCase() || raw === '普通员工'.toUpperCase() || raw === 'MANAGEMENT' || raw === 'EMPLOYEE') return 'MANAGEMENT';
    if (raw === '管理员'.toUpperCase() || raw === 'ADMIN') return 'ADMIN';
    if (raw === '老板'.toUpperCase() || raw === '石总'.toUpperCase() || raw === 'BOSS') return 'BOSS';
    return null;
  }

  async changeMemberRole(userId:string, role:string, actor:AuthenticatedUser) {
    if (!['MANAGEMENT','ADMIN'].includes(role)) throw new BadRequestException({ code:'INVALID_ROLE', message:'不可在此设置该角色' });
    const boss = await this.database.query(`SELECT role FROM user_roles WHERE user_id=$1 AND role IN ('BOSS','BOSS_VIEWER') LIMIT 1`,[userId]);
    if (boss.rowCount) throw new BadRequestException({ code:'BOSS_ROLE_PROTECTED', message:'老板角色不可直接修改' });
    await this.database.transaction(async client => {
      await client.query(`DELETE FROM user_roles WHERE user_id=$1 AND role IN ('MANAGEMENT','ADMIN')`,[userId]);
      await client.query('INSERT INTO user_roles (user_id,role,granted_by) VALUES ($1,$2,$3)',[userId,role,actor.id]);
    });
    return { ok:true };
  }

  async removeMember(userId:string, actor:AuthenticatedUser) {
    if (userId === actor.id) throw new BadRequestException({ code:'SELF_REMOVAL_FORBIDDEN', message:'不能移除当前登录账号' });
    const boss = await this.database.query(`SELECT role FROM user_roles WHERE user_id=$1 AND role IN ('BOSS','BOSS_VIEWER') LIMIT 1`,[userId]);
    if (boss.rowCount) throw new BadRequestException({ code:'BOSS_ROLE_PROTECTED', message:'老板成员不可移除' });
    const result = await this.database.query(`UPDATE app_users SET status='DISABLED',removed_at=now() WHERE id=$1 AND removed_at IS NULL RETURNING id`,[userId]);
    if (!result.rowCount) throw new NotFoundException({ code:'MEMBER_NOT_FOUND', message:'成员不存在' });
    return { ok:true };
  }

  async setRoomEnabled(roomId:string, enabled:boolean) {
    const result = await this.database.query(`UPDATE meeting_rooms SET enabled=$2 WHERE id=$1 RETURNING id`,[roomId,enabled]);
    if (!result.rowCount) throw new NotFoundException({ code:'ROOM_NOT_FOUND', message:'会议室不存在' });
    return { ok:true };
  }

  async listBossSchedule(bossId: string, date: string, actor: AuthenticatedUser) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException({ code: 'INVALID_DATE', message: '日期格式应为 YYYY-MM-DD' });
    }
    const boss = await this.database.query(
      `SELECT 1 FROM app_users u JOIN user_roles r ON r.user_id=u.id
       WHERE u.id=$1 AND r.role='BOSS' AND u.status='ACTIVE' AND u.removed_at IS NULL`,
      [bossId],
    );
    if (!boss.rowCount) throw new NotFoundException({ code: 'BOSS_NOT_FOUND', message: '未找到老板账号' });

    const canReadPrivate = actor.id === bossId || actor.roles.includes('ADMIN') || actor.roles.includes('BOSS_VIEWER');
    const result = await this.database.query<{
      id:string; sourceType:string; title:string | null; startAt:Date; endAt:Date;
      visibility:'ALL_MEMBERS'|'BOSS_ONLY'; roomName:string | null; participantNames:string[]|null; meetingContent:string|null; applicantId:string|null;
    }>(
      `WITH active_schedule AS (
         SELECT s.id, s.source_type AS "sourceType", s.title, s.meeting_content AS "meetingContent", s.start_at AS "startAt",
                s.end_at AS "endAt", s.visibility, r.name AS "roomName",
                COALESCE(participants.names, ARRAY[]::text[]) AS "participantNames", NULL::uuid AS "applicantId"
         FROM schedule_entries s
         LEFT JOIN meeting_rooms r ON r.id=s.room_id
         LEFT JOIN LATERAL (
           SELECT array_agg(name ORDER BY name) names
           FROM (
             SELECT DISTINCT u.display_name name
             FROM (
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
           AND s.start_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')
           AND s.end_at > ($2::date::timestamp AT TIME ZONE 'Asia/Shanghai')
       ),
       pending_requests AS (
         SELECT mr.id, 'PENDING_REQUEST'::text AS "sourceType", mr.topic AS title, mr.meeting_content AS "meetingContent",
                mr.start_at AS "startAt", mr.end_at AS "endAt", mr.visibility, r.name AS "roomName",
                ARRAY[u.display_name]::text[] AS "participantNames", mr.applicant_user_id AS "applicantId"
         FROM meeting_requests mr
         JOIN app_users u ON u.id=mr.applicant_user_id
         LEFT JOIN meeting_rooms r ON r.id=mr.room_id
         WHERE mr.boss_user_id=$1 AND mr.status='PENDING'
           AND mr.start_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')
           AND mr.end_at > ($2::date::timestamp AT TIME ZONE 'Asia/Shanghai')
       )
       SELECT * FROM active_schedule
       UNION ALL
       SELECT * FROM pending_requests
       ORDER BY "startAt"`,
      [bossId, date],
    );
    return result.rows.map((row) => {
      const privateEntry = row.visibility === 'BOSS_ONLY' && !canReadPrivate && row.applicantId !== actor.id;
      const publicTitle = '已占用';
      return {
        id: row.id,
        sourceType: row.sourceType,
        title: privateEntry ? publicTitle : (row.title || publicTitle),
        startAt: row.startAt,
        endAt: row.endAt,
        visibility: row.visibility,
        roomName: privateEntry ? null : row.roomName,
        participantNames: privateEntry ? [] : (row.participantNames ?? []),
        meetingContent: privateEntry ? null : row.meetingContent,
      };
    });
  }

  async listCurrentBossSchedule(date: string, actor: AuthenticatedUser) {
    const result = await this.database.query<{ id:string }>(
      `SELECT u.id FROM app_users u JOIN user_roles r ON r.user_id=u.id
       WHERE r.role='BOSS' AND u.status='ACTIVE' AND u.removed_at IS NULL LIMIT 1`,
    );
    if (!result.rows[0]) throw new NotFoundException({ code:'BOSS_NOT_FOUND', message:'未找到老板账号' });
    return this.listBossSchedule(result.rows[0].id,date,actor);
  }
}
