import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../domain/model';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ResourcesService {
  constructor(private readonly database: DatabaseService) {}

  async listManagement() {
    const result = await this.database.query(
      `SELECT u.id, u.wecom_user_id AS "wecomUserId", u.display_name AS "displayName",
              u.job_title AS "jobTitle", u.department
       FROM app_users u
       JOIN user_roles r ON r.user_id = u.id AND r.role = 'MANAGEMENT'
       WHERE u.status = 'ACTIVE' AND u.removed_at IS NULL
       ORDER BY u.department NULLS LAST, u.display_name`,
    );
    return result.rows;
  }

  async listMembers() {
    const result = await this.database.query(
      `SELECT u.id, u.display_name AS "displayName", u.job_title AS "jobTitle",
              u.department, u.wecom_user_id IS NOT NULL AS "wecomBound",
              array_agg(r.role ORDER BY r.role)::text[] AS roles
       FROM app_users u
       JOIN user_roles r ON r.user_id=u.id
       WHERE u.status='ACTIVE' AND u.removed_at IS NULL
       GROUP BY u.id, u.display_name, u.job_title, u.department, u.wecom_user_id
       ORDER BY u.department NULLS LAST, u.display_name`,
    );
    return result.rows;
  }

  async listRooms() {
    const result = await this.database.query(
      `SELECT id, name, floor, capacity, equipment
       FROM meeting_rooms WHERE enabled ORDER BY floor, name`,
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
       FROM meeting_rooms r WHERE r.enabled ORDER BY r.floor,r.name`,
      [startAt,endAt],
    );
    return result.rows;
  }

  async addMember(body:Record<string,unknown>, actor:AuthenticatedUser) {
    const name = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const department = typeof body.department === 'string' ? body.department.trim() : '';
    const role = String(body.role || 'MANAGEMENT');
    if (!name || !department) throw new BadRequestException({ code:'MEMBER_FIELDS_REQUIRED', message:'请填写姓名和部门' });
    if (!['MANAGEMENT','ADMIN'].includes(role)) throw new BadRequestException({ code:'INVALID_ROLE', message:'新增成员角色无效' });
    return this.database.transaction(async client => {
      const user = await client.query<{id:string}>(
        `INSERT INTO app_users (display_name,department,status,source) VALUES ($1,$2,'ACTIVE','MANUAL') RETURNING id`,
        [name,department],
      );
      await client.query('INSERT INTO user_roles (user_id,role,granted_by) VALUES ($1,$2,$3)',[user.rows[0]!.id,role,actor.id]);
      return { id:user.rows[0]!.id,displayName:name,department,roles:[role],wecomBound:false };
    });
  }

  async changeMemberRole(userId:string, role:string, actor:AuthenticatedUser) {
    if (!['MANAGEMENT','ADMIN'].includes(role)) throw new BadRequestException({ code:'INVALID_ROLE', message:'不可在此设置该角色' });
    const boss = await this.database.query(`SELECT 1 FROM user_roles WHERE user_id=$1 AND role='BOSS'`,[userId]);
    if (boss.rowCount) throw new BadRequestException({ code:'BOSS_ROLE_PROTECTED', message:'老板角色不可直接修改' });
    await this.database.transaction(async client => {
      await client.query(`DELETE FROM user_roles WHERE user_id=$1 AND role IN ('MANAGEMENT','ADMIN')`,[userId]);
      await client.query('INSERT INTO user_roles (user_id,role,granted_by) VALUES ($1,$2,$3)',[userId,role,actor.id]);
    });
    return { ok:true };
  }

  async removeMember(userId:string, actor:AuthenticatedUser) {
    if (userId === actor.id) throw new BadRequestException({ code:'SELF_REMOVAL_FORBIDDEN', message:'不能移除当前登录账号' });
    const boss = await this.database.query(`SELECT 1 FROM user_roles WHERE user_id=$1 AND role='BOSS'`,[userId]);
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

    const canReadPrivate = actor.id === bossId || actor.roles.includes('ADMIN');
    const result = await this.database.query<{
      id:string; sourceType:string; title:string | null; startAt:Date; endAt:Date;
      visibility:'ALL_MEMBERS'|'BOSS_ONLY'; roomName:string | null;
    }>(
      `SELECT s.id, s.source_type AS "sourceType", s.title, s.start_at AS "startAt",
              s.end_at AS "endAt", s.visibility, r.name AS "roomName"
       FROM schedule_entries s
       LEFT JOIN meeting_rooms r ON r.id=s.room_id
       WHERE s.boss_user_id=$1 AND s.status='ACTIVE'
         AND s.start_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai')
         AND s.end_at > ($2::date::timestamp AT TIME ZONE 'Asia/Shanghai')
       ORDER BY s.start_at`,
      [bossId, date],
    );
    return result.rows.map((row) => {
      const privateEntry = row.visibility === 'BOSS_ONLY' && !canReadPrivate;
      const publicTitle = row.sourceType === 'PERSONAL' ? '个人行程' : '已占用';
      return {
        id: row.id,
        sourceType: row.sourceType,
        title: privateEntry ? publicTitle : (row.title || publicTitle),
        startAt: row.startAt,
        endAt: row.endAt,
        visibility: row.visibility,
        roomName: privateEntry ? null : row.roomName,
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
