import type { VoiceCommand } from './voice-command.schema';
import type { AsrPort, AudioInput, CommandParserPort, VoiceCommandExecutorPort } from './voice.ports';

export class FakeAsrAdapter implements AsrPort {
  async transcribe(input: AudioInput) {
    return { text: new TextDecoder().decode(input.bytes) || '今天有空', providerRequestId: 'fake-asr' };
  }
}

export class FakeDeepSeekAdapter implements CommandParserPort {
  constructor(private readonly result?: VoiceCommand) {}

  async parse(_input: { transcript: string; nowIso: string; timezone: 'Asia/Shanghai' }) {
    return this.result ?? {
      schemaVersion: 1,
      action: 'CHANGE_STATUS',
      title: null,
      date: null,
      startTime: null,
      endTime: null,
      status: 'AVAILABLE',
      confidence: 1,
      missingFields: [],
      requiresConfirmation: true,
    } satisfies VoiceCommand;
  }
}

export class FakeVoiceCommandExecutor implements VoiceCommandExecutorPort {
  readonly calls: Array<{ command: VoiceCommand; idempotencyKey: string }> = [];
  private readonly results = new Map<string, { executionId: string }>();

  async execute(input: { command: VoiceCommand; idempotencyKey: string }) {
    const existing = this.results.get(input.idempotencyKey);
    if (existing) return existing;
    this.calls.push(input);
    const result = { executionId: `fake-execution-${this.calls.length}` };
    this.results.set(input.idempotencyKey, result);
    return result;
  }
}
