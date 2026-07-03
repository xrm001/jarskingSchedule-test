import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApproveRequestPipe } from '../src/modules/approvals/approve-request.dto';

describe('ApproveRequestPipe', () => {
  const pipe = new ApproveRequestPipe();
  const metadata = { type: 'body' as const };

  it('accepts an integer expectedVersion', () => {
    expect(pipe.transform({ expectedVersion: 2 }, metadata)).toEqual({ expectedVersion: 2 });
  });

  it.each([undefined, null, {}, { expectedVersion: '2' }, { expectedVersion: -1 }, { expectedVersion: 1.5 }])(
    'rejects invalid input %#',
    (body) => expect(() => pipe.transform(body, metadata)).toThrow(BadRequestException),
  );
});
