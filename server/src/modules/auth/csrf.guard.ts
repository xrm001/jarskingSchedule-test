import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC } from './public.decorator';
import { SessionService, type SessionRequest } from './session.service';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<SessionRequest & { method:string }>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    if (!await this.sessions.verifyCsrf(request)) {
      throw new ForbiddenException({ code:'CSRF_INVALID', message:'页面会话校验失败，请重新打开应用' });
    }
    return true;
  }
}
