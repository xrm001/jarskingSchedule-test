import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { validateVoiceCommand, type VoiceCommand } from './voice-command.schema';
import {
  ASR_PORT,
  COMMAND_PARSER_PORT,
  VOICE_COMMAND_EXECUTOR_PORT,
  type AsrPort,
  type AudioInput,
  type CommandParserPort,
  type VoiceCommandExecutorPort,
} from './voice.ports';

const TIMEZONE = 'Asia/Shanghai' as const;
const MIN_CONFIDENCE = 0.8;
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export type VoiceCommandErrorCode =
  | 'EMPTY_TRANSCRIPT'
  | 'INVALID_COMMAND'
  | 'CONFIRMATION_NOT_FOUND'
  | 'CONFIRMATION_TAMPERED'
  | 'CONFIRMATION_EXPIRED';

export class VoiceCommandError extends Error {
  constructor(public readonly code: VoiceCommandErrorCode, message: string) {
    super(message);
    this.name = 'VoiceCommandError';
  }
}

interface PendingConfirmation {
  commandJson: string;
  confirmationHash: string;
  idempotencyKey: string;
  expiresAt: number;
  execution?: { executionId: string };
}

export interface VoiceAnalysisResult {
  transcript: string;
  command: VoiceCommand;
  canConfirm: boolean;
  issues: string[];
  confirmationId?: string;
  confirmationHash?: string;
  expiresAt?: string;
}

@Injectable()
export class VoiceCommandService {
  private readonly pending = new Map<string, PendingConfirmation>();

  constructor(
    @Inject(ASR_PORT) private readonly asr: AsrPort,
    @Inject(COMMAND_PARSER_PORT) private readonly parser: CommandParserPort,
    @Inject(VOICE_COMMAND_EXECUTOR_PORT) private readonly executor: VoiceCommandExecutorPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async analyze(audio: AudioInput): Promise<VoiceAnalysisResult> {
    const transcript = (await this.asr.transcribe(audio)).text.trim();
    if (!transcript) throw new VoiceCommandError('EMPTY_TRANSCRIPT', '语音中未识别到文字');

    let command: VoiceCommand;
    try {
      command = validateVoiceCommand(await this.parser.parse({
        transcript,
        nowIso: this.now().toISOString(),
        timezone: TIMEZONE,
      }));
    } catch {
      throw new VoiceCommandError('INVALID_COMMAND', '模型返回的指令格式无效');
    }
    const issues = this.validateBusinessRules(command);
    const canConfirm = issues.length === 0;
    if (!canConfirm) return { transcript, command, canConfirm, issues };

    const confirmationId = randomUUID();
    const commandJson = stableCommandJson(command);
    const confirmationHash = hash(`${confirmationId}\n${transcript}\n${commandJson}`);
    const expiresAt = this.now().getTime() + CONFIRMATION_TTL_MS;
    this.pending.set(confirmationId, {
      commandJson,
      confirmationHash,
      idempotencyKey: `voice:${confirmationId}`,
      expiresAt,
    });
    return {
      transcript,
      command,
      canConfirm,
      issues,
      confirmationId,
      confirmationHash,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  async confirm(input: {
    confirmationId: string;
    confirmationHash: string;
    command: VoiceCommand;
  }): Promise<{ executionId: string; duplicate: boolean }> {
    const pending = this.pending.get(input.confirmationId);
    if (!pending) throw new VoiceCommandError('CONFIRMATION_NOT_FOUND', '确认记录不存在');
    if (this.now().getTime() > pending.expiresAt) {
      this.pending.delete(input.confirmationId);
      throw new VoiceCommandError('CONFIRMATION_EXPIRED', '确认记录已过期，请重新识别');
    }

    let command: VoiceCommand;
    try {
      command = validateVoiceCommand(input.command);
    } catch {
      throw new VoiceCommandError('CONFIRMATION_TAMPERED', '确认内容格式无效');
    }
    const suppliedHash = hash(input.confirmationHash);
    const expectedHash = hash(pending.confirmationHash);
    if (
      stableCommandJson(command) !== pending.commandJson
      || !timingSafeEqual(Buffer.from(suppliedHash), Buffer.from(expectedHash))
    ) {
      throw new VoiceCommandError('CONFIRMATION_TAMPERED', '确认内容与识别结果不一致');
    }
    if (pending.execution) return { ...pending.execution, duplicate: true };

    const execution = await this.executor.execute({
      command,
      idempotencyKey: pending.idempotencyKey,
    });
    pending.execution = execution;
    return { ...execution, duplicate: false };
  }

  private validateBusinessRules(command: VoiceCommand): string[] {
    const issues = [...command.missingFields];
    if (command.action === 'UNKNOWN' || command.confidence < MIN_CONFIDENCE) issues.push('指令存在歧义，请补充或重新表达');

    if (command.action === 'CREATE_SCHEDULE') {
      if (!command.date) issues.push('缺少日期');
      if (!command.startTime) issues.push('缺少开始时间');
      if (!command.endTime) issues.push('缺少结束时间');
      if (!command.title) issues.push('缺少行程标题');
      if (command.date && !isRealDate(command.date)) issues.push('日期无效');
      if (command.startTime && command.endTime && command.startTime >= command.endTime) issues.push('结束时间必须晚于开始时间');
    }
    if (command.action === 'CHANGE_STATUS' && !command.status) issues.push('缺少目标状态');
    return [...new Set(issues)];
  }
}

function stableCommandJson(command: VoiceCommand): string {
  return JSON.stringify(command, Object.keys(command).sort());
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
