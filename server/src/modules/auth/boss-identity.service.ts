import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../domain/model';
import { DomainError } from '../../domain/domain-error';

@Injectable()
export class BossIdentityService {
  assertOnlyBoss(user: AuthenticatedUser): void {
    const bossWecomUserId = process.env.BOSS_WECOM_USER_ID;
    if (!bossWecomUserId || user.wecomUserId !== bossWecomUserId || !user.roles.includes('BOSS')) {
      throw new DomainError('BOSS_ONLY', '仅石总本人可以审批');
    }
  }

  assertRequestTargetsBoss(candidateBossUserId: string, actor: AuthenticatedUser): void {
    const configuredBossId = process.env.BOSS_APP_USER_ID;
    // The authenticated boss and appointment target must be the same internal account.
    if (candidateBossUserId !== actor.id || (configuredBossId && candidateBossUserId !== configuredBossId)) {
      throw new DomainError('BOSS_ONLY', '申请对象不是系统绑定的石总账号');
    }
  }
}
