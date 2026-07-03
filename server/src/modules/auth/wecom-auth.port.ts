import type { AuthenticatedUser } from '../../domain/model';

/** Infrastructure adapter must exchange a one-time WeCom OAuth code server-side. */
export interface WeComIdentityPort {
  exchangeCode(code: string): Promise<{ wecomUserId: string }>;
  resolveApplicationUser(wecomUserId: string): Promise<AuthenticatedUser | null>;
}

export const WECOM_IDENTITY_PORT = Symbol('WECOM_IDENTITY_PORT');
