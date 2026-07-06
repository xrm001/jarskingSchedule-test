import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../src/modules/database/database.service';
import { SessionService } from '../src/modules/auth/session.service';

describe('SessionService', () => {
  it('sanitizes an external OAuth return path', async () => {
    const query = vi.fn().mockResolvedValue({ rows:[], rowCount:1 });
    const sessions = new SessionService({ query } as unknown as DatabaseService);
    await sessions.createOAuthState('//evil.example/path');
    expect(query.mock.calls[0]?.[1]?.[1]).toBe('/');
  });

  it('hydrates the authenticated user from a valid opaque session', async () => {
    const query = vi.fn().mockResolvedValue({
      rows:[{ id:'u1', display_name:'子墨', wecom_user_id:'jason_m', roles:['ADMIN'] }], rowCount:1,
    });
    const sessions = new SessionService({ query } as unknown as DatabaseService);
    const request = { headers:{ cookie:'jarsking_session=opaque-token' } };
    await sessions.authenticate(request);
    expect(request).toHaveProperty('user', { id:'u1', name:'子墨', wecomUserId:'jason_m', roles:['ADMIN'] });
  });

  it('rejects mismatched double-submit CSRF values without querying the database', async () => {
    const query = vi.fn();
    const sessions = new SessionService({ query } as unknown as DatabaseService);
    const valid = await sessions.verifyCsrf({
      headers:{ cookie:'jarsking_session=s;jarsking_csrf=one', 'x-csrf-token':'two' },
    });
    expect(valid).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});
