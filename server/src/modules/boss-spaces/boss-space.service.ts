import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface BossSpace {
  id: string;
  bossUserId: string;
  displayName: string;
  shortName: string;
  isDefault: boolean;
}

@Injectable()
export class BossSpaceService {
  constructor(private readonly database: DatabaseService) {}

  normalize(space: string | null | undefined): string | null {
    const value = String(space ?? '').trim().toLowerCase();
    return value === 'mao' || value === 'shi' ? value : null;
  }

  async resolve(space?: string | null): Promise<BossSpace> {
    const normalized = this.normalize(space);
    const result = await this.database.query<BossSpace>(
      `SELECT id, boss_user_id AS "bossUserId", display_name AS "displayName",
              short_name AS "shortName", is_default AS "isDefault"
       FROM boss_spaces
       WHERE enabled AND ($1::text IS NULL OR id=$1)
       ORDER BY CASE WHEN id=$1 THEN 0 WHEN is_default THEN 1 ELSE 2 END, sort_order, id
       LIMIT 1`,
      [normalized],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException({ code:'BOSS_SPACE_NOT_FOUND', message:'未找到对应的老板入口' });
    return row;
  }

  async resolveBossId(space?: string | null): Promise<string> {
    return (await this.resolve(space)).bossUserId;
  }

  async resolveByBossId(bossUserId: string): Promise<BossSpace | null> {
    const result = await this.database.query<BossSpace>(
      `SELECT id, boss_user_id AS "bossUserId", display_name AS "displayName",
              short_name AS "shortName", is_default AS "isDefault"
       FROM boss_spaces
       WHERE enabled AND boss_user_id=$1
       LIMIT 1`,
      [bossUserId],
    );
    return result.rows[0] ?? null;
  }
}
