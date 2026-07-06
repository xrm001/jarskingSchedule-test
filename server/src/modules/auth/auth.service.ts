import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser, UserRole } from '../../domain/model';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  async resolveUser(wecomUserId: string): Promise<AuthenticatedUser | null> {
    const result = await this.database.query<{ id:string; display_name:string; wecom_user_id:string; roles:UserRole[] }>(
      `SELECT u.id, u.display_name, u.wecom_user_id, array_agg(r.role)::text[] AS roles
       FROM app_users u JOIN user_roles r ON r.user_id=u.id
       WHERE u.wecom_user_id=$1 AND u.status='ACTIVE' AND u.removed_at IS NULL
       GROUP BY u.id, u.display_name, u.wecom_user_id`,
      [wecomUserId],
    );
    const row = result.rows[0];
    return row ? { id:row.id, name:row.display_name, wecomUserId:row.wecom_user_id, roles:row.roles } : null;
  }
}
