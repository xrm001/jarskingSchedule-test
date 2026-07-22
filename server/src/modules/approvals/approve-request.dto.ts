import { BadRequestException, Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { ApprovalMeetingMode } from '../../domain/model';

export interface ApproveRequestDto {
  expectedVersion: number;
  meetingMode?: ApprovalMeetingMode;
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
    const meetingMode = (value as Record<string, unknown>).meetingMode;
    if (meetingMode !== undefined && meetingMode !== 'FACE_TO_FACE' && meetingMode !== 'REMOTE') {
      throw new BadRequestException({ code: 'INVALID_MEETING_MODE', message: 'meetingMode must be FACE_TO_FACE or REMOTE' });
    }
    return { expectedVersion: expectedVersion as number, meetingMode: meetingMode as ApprovalMeetingMode | undefined };
  }
}
