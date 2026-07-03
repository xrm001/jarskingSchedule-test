import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_ROLES } from './roles.decorator';
import type { UserRole } from '../../domain/model';
import type { RequestWithUser } from './request-with-user';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user || !required.some((role) => user.roles.includes(role))) {
      throw new ForbiddenException({ code: 'ROLE_FORBIDDEN', message: '当前企业微信成员无此权限' });
    }
    return true;
  }
}
