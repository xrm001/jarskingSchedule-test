import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from './public.decorator';
import type { RequestWithUser } from './request-with-user';

/** Default-deny guard. A future session middleware must set request.user after server-side validation. */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: '请从企业微信工作台登录' });
    }
    return true;
  }
}
