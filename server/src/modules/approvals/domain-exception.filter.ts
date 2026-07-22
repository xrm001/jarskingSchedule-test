import { ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { DomainError, type ErrorCode } from '../../domain/domain-error';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BOSS_ONLY: HttpStatus.FORBIDDEN,
  REQUEST_NOT_FOUND: HttpStatus.NOT_FOUND,
  REQUEST_STATE_CHANGED: HttpStatus.CONFLICT,
  VERSION_CONFLICT: HttpStatus.CONFLICT,
  INVALID_TIME_RANGE: HttpStatus.UNPROCESSABLE_ENTITY,
  ROOM_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  BOSS_NOT_FOUND: HttpStatus.NOT_FOUND,
  ROOM_NOT_FOUND: HttpStatus.NOT_FOUND,
  SCHEDULE_CONFLICT: HttpStatus.CONFLICT,
  BOSS_SCHEDULE_CONFLICT: HttpStatus.CONFLICT,
  ROOM_CONFLICT: HttpStatus.CONFLICT,
};

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  catch(error: DomainError, host: ArgumentsHost): void {
    const statusCode = STATUS_BY_CODE[error.code];
    const response = host.switchToHttp().getResponse<{
      status(code: number): { send(body: unknown): void };
    }>();
    response.status(statusCode).send({
      statusCode,
      code: error.code,
      message: error.message,
    });
  }
}
