import { BadRequestException, Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';

export interface ApproveRequestDto {
  expectedVersion: number;
}

/** Runtime validation without silently coercing strings into concurrency versions. */
@Injectable()
export class ApproveRequestPipe implements PipeTransform<unknown, ApproveRequestDto> {
  transform(value: unknown, _metadata: ArgumentMetadata): ApproveRequestDto {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: '请求体必须是 JSON 对象' });
    }
    const expectedVersion = (value as Record<string, unknown>).expectedVersion;
    if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 0) {
      throw new BadRequestException({ code: 'INVALID_EXPECTED_VERSION', message: 'expectedVersion 必须是非负整数' });
    }
    return { expectedVersion: expectedVersion as number };
  }
}
