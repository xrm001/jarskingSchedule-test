export type ErrorCode =
  | 'BOSS_ONLY'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_STATE_CHANGED'
  | 'VERSION_CONFLICT'
  | 'INVALID_TIME_RANGE'
  | 'ROOM_REQUIRED'
  | 'BOSS_NOT_FOUND'
  | 'ROOM_NOT_FOUND'
  | 'SCHEDULE_CONFLICT'
  | 'BOSS_SCHEDULE_CONFLICT'
  | 'ROOM_CONFLICT';

export class DomainError extends Error {
  constructor(public readonly code: ErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}
