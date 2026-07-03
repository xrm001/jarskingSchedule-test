import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { AuthenticationGuard } from '../src/modules/auth/authentication.guard';
import { IS_PUBLIC } from '../src/modules/auth/public.decorator';

const context = (handler: () => void, user?: object): ExecutionContext => ({
  getHandler: () => handler,
  getClass: () => class TestController {},
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
} as unknown as ExecutionContext);

describe('AuthenticationGuard', () => {
  const guard = new AuthenticationGuard(new Reflector());

  it('denies protected routes when no validated session user exists', () => {
    expect(() => guard.canActivate(context(() => undefined))).toThrow(UnauthorizedException);
  });

  it('allows explicitly public routes such as health checks', () => {
    const handler = (): void => undefined;
    Reflect.defineMetadata(IS_PUBLIC, true, handler);
    expect(guard.canActivate(context(handler))).toBe(true);
  });

  it('allows protected routes after authentication middleware supplies a user', () => {
    expect(guard.canActivate(context(() => undefined, { id: 'validated-user' }))).toBe(true);
  });
});
