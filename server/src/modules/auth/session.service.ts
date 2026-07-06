import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedUser, UserRole } from '../../domain/model';
import { DatabaseService } from '../database/database.service';

const SESSION_COOKIE = 'jarsking_session';
const CSRF_COOKIE = 'jarsking_csrf';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();
const token = (): string => randomBytes(32).toString('base64url');

function cookieValue(header: string | undefined, name: string): string | undefined {
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export interface SessionRequest {
  headers: { cookie?: string; 'x-csrf-token'?: string | string[] };
  user?: AuthenticatedUser;
}

@Injectable()
export class SessionService {
  constructor(private readonly database: DatabaseService) {}

  async createOAuthState(returnPath: string): Promise<string> {
    const state = token();
    const safePath = returnPath.startsWith('/') && !returnPath.startsWith('//') ? returnPath : '/';
    await this.database.query(
      `INSERT INTO oauth_states (state_hash, return_path, expires_at)
       VALUES ($1,$2,now() + interval '5 minutes')`,
      [digest(state), safePath],
    );
    return state;
  }

  async consumeOAuthState(state: string): Promise<string | null> {
    const result = await this.database.query<{ return_path:string }>(
      `UPDATE oauth_states SET consumed_at=now()
       WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>now()
       RETURNING return_path`,
      [digest(state)],
    );
    return result.rows[0]?.return_path ?? null;
  }

  async readOAuthState(state: string): Promise<string | null> {
    const result = await this.database.query<{ return_path:string }>(
      `SELECT return_path FROM oauth_states
       WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>now()`,
      [digest(state)],
    );
    return result.rows[0]?.return_path ?? null;
  }

  async createSession(userId: string): Promise<{ sessionToken:string; csrfToken:string; maxAge:number }> {
    const sessionToken = token();
    const csrfToken = token();
    const maxAge = Number(process.env.SESSION_MAX_AGE_SECONDS ?? 43_200);
    await this.database.query(
      `INSERT INTO auth_sessions (user_id, token_hash, csrf_hash, expires_at)
       VALUES ($1,$2,$3,now() + ($4 * interval '1 second'))`,
      [userId, digest(sessionToken), digest(csrfToken), maxAge],
    );
    return { sessionToken, csrfToken, maxAge };
  }

  async authenticate(request: SessionRequest): Promise<void> {
    const raw = cookieValue(request.headers.cookie, SESSION_COOKIE);
    if (!raw) return;
    const result = await this.database.query<{
      id:string; display_name:string; wecom_user_id:string; roles:UserRole[];
    }>(
      `SELECT u.id, u.display_name, u.wecom_user_id, array_agg(r.role)::text[] AS roles
       FROM auth_sessions s
       JOIN app_users u ON u.id=s.user_id
       JOIN user_roles r ON r.user_id=u.id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
         AND u.status='ACTIVE' AND u.removed_at IS NULL
       GROUP BY u.id, u.display_name, u.wecom_user_id`,
      [digest(raw)],
    );
    const row = result.rows[0];
    if (row?.wecom_user_id) request.user = { id:row.id, name:row.display_name, wecomUserId:row.wecom_user_id, roles:row.roles };
  }

  async verifyCsrf(request: SessionRequest): Promise<boolean> {
    const cookie = cookieValue(request.headers.cookie, CSRF_COOKIE);
    const session = cookieValue(request.headers.cookie, SESSION_COOKIE);
    const headerValue = request.headers['x-csrf-token'];
    const header = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!cookie || !session || !header) return false;
    const left = digest(cookie);
    const right = digest(header);
    if (!timingSafeEqual(left, right)) return false;
    const result = await this.database.query(
      `SELECT 1 FROM auth_sessions
       WHERE token_hash=$1 AND csrf_hash=$2 AND revoked_at IS NULL AND expires_at>now()`,
      [digest(session), left],
    );
    return Boolean(result.rowCount);
  }

  async revoke(cookieHeader: string | undefined): Promise<void> {
    const raw = cookieValue(cookieHeader, SESSION_COOKIE);
    if (raw) await this.database.query('UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1', [digest(raw)]);
  }
}

export const authCookieHeaders = (sessionToken: string, csrfToken: string, maxAge: number): string[] => [
  `${SESSION_COOKIE}=${sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
  `${CSRF_COOKIE}=${csrfToken}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`,
];

export const clearAuthCookieHeaders = (): string[] => [
  `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
  `${CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`,
];
