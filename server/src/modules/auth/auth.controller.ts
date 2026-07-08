import { BadRequestException, Controller, Get, Post, Query, Req, Res, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from './public.decorator';
import type { RequestWithUser } from './request-with-user';
import { AuthService } from './auth.service';
import { SessionService, authCookieHeaders, clearAuthCookieHeaders } from './session.service';
import { WeComClientService } from './wecom-client.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly sessions: SessionService,
    private readonly wecom: WeComClientService,
    private readonly auth: AuthService,
  ) {}

  @Get('wecom/start')
  @Public()
  async start(@Query('returnPath') returnPath: string | undefined, @Res() reply: FastifyReply) {
    this.assertOAuthEnabled();
    const state = await this.sessions.createOAuthState(returnPath || '/');
    return reply.redirect(this.wecom.authorizationUrl(state), 302);
  }

  @Get('wecom/callback')
  @Public()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    this.assertOAuthEnabled();
    if (!code || !state) throw new BadRequestException({ code:'OAUTH_CALLBACK_INVALID', message:'企微登录参数不完整' });
    const returnPath = await this.sessions.readOAuthState(state);
    if (!returnPath) throw new BadRequestException({ code:'OAUTH_STATE_INVALID', message:'登录请求已过期，请重新打开应用' });
    const wecomUserId = await this.wecom.exchangeCode(code);
    if (!await this.sessions.consumeOAuthState(state)) {
      throw new BadRequestException({ code:'OAUTH_STATE_INVALID', message:'登录请求已被使用，请重新打开应用' });
    }
    const user = await this.auth.resolveUser(wecomUserId);
    if (!user) throw new UnauthorizedException({ code:'USER_NOT_AUTHORIZED', message:'该企微账号尚未加入应用名单' });
    const created = await this.sessions.createSession(user.id);
    reply.header('Set-Cookie', authCookieHeaders(created.sessionToken, created.csrfToken, created.maxAge));
    const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, '') ?? '';
    return reply.redirect(`${baseUrl}${returnPath}`, 302);
  }

  @Get('me')
  me(@Req() request: RequestWithUser) {
    const user = request.user!;
    const readOnlyBoss = user.roles.includes('BOSS_VIEWER') && !user.roles.includes('BOSS');
    const role = user.roles.includes('BOSS') || readOnlyBoss ? 'BOSS' : user.roles.includes('ADMIN') ? 'ADMIN' : 'MANAGEMENT';
    return {
      id:user.id, name:user.name, role, roles:user.roles,
      readOnlyBoss,
      isTestRole:Boolean(user.isTestRole),
      testRole:user.testRole ?? null,
      canTestRoles:Boolean(request.realUser?.roles.includes('ADMIN')),
      realUser:request.realUser ? { id:request.realUser.id, name:request.realUser.name, role:request.realUser.roles.includes('ADMIN') ? 'ADMIN' : request.realUser.roles[0] } : null,
    };
  }

  @Post('logout')
  async logout(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    await this.sessions.revoke(request.headers.cookie);
    reply.header('Set-Cookie', clearAuthCookieHeaders());
    return reply.send({ ok:true });
  }

  private assertOAuthEnabled(): void {
    if (process.env.WECOM_AUTH_ENABLED !== 'true') {
      throw new ServiceUnavailableException({ code:'WECOM_AUTH_DISABLED', message:'企业微信登录尚未启用' });
    }
  }
}
