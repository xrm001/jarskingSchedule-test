import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DomainError, type ErrorCode } from '../src/domain/domain-error';
import { DomainExceptionFilter } from '../src/modules/approvals/domain-exception.filter';

describe('DomainExceptionFilter', () => {
  it.each<[ErrorCode, number]>([
    ['BOSS_ONLY', 403],
    ['REQUEST_NOT_FOUND', 404],
    ['REQUEST_STATE_CHANGED', 409],
    ['VERSION_CONFLICT', 409],
    ['INVALID_TIME_RANGE', 422],
    ['BOSS_SCHEDULE_CONFLICT', 409],
    ['ROOM_CONFLICT', 409],
  ])('maps %s to HTTP %i', (code, expectedStatus) => {
    const send = vi.fn();
    const status = vi.fn(() => ({ send }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    new DomainExceptionFilter().catch(new DomainError(code, 'message'), host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(send).toHaveBeenCalledWith({ statusCode: expectedStatus, code, message: 'message' });
  });
});
