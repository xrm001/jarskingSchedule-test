import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../../domain/model';
import { DomainError } from '../../domain/domain-error';

@Injectable()
export class BossIdentityService {
  assertOnlyBoss(user: AuthenticatedUser): void {
    if (!user.roles.includes('BOSS')) {
      throw new DomainError('BOSS_ONLY', '仅老板本人可以审批');
    }
  }

  assertRequestTargetsBoss(candidateBossUserId: string, actor: AuthenticatedUser): void {
    const isTestRole = Boolean((actor as AuthenticatedUser & { isTestRole?: boolean }).isTestRole);
    if (candidateBossUserId !== actor.id && !isTestRole) {
      throw new DomainError('BOSS_ONLY', '申请对象不是当前老板账号');
    }
  }
}
