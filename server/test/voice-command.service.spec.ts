import { describe, expect, it } from 'vitest';
import { FakeAsrAdapter, FakeDeepSeekAdapter, FakeVoiceCommandExecutor } from '../src/voice/fake-voice.adapters';
import type { VoiceCommand } from '../src/voice/voice-command.schema';
import { VoiceCommandService } from '../src/voice/voice-command.service';

const audio = (text: string) => ({
  bytes: new TextEncoder().encode(text),
  mimeType: 'audio/mp4' as const,
});

const schedule = (overrides: Partial<VoiceCommand> = {}): VoiceCommand => ({
  schemaVersion: 1,
  action: 'CREATE_SCHEDULE',
  title: '外出',
  date: '2026-07-03',
  startTime: '10:00',
  endTime: '15:00',
  status: 'OUT_OF_OFFICE',
  confidence: 0.98,
  missingFields: [],
  requiresConfirmation: true,
  ...overrides,
});

function createService(command: VoiceCommand, now = new Date('2026-07-03T01:00:00.000Z')) {
  const executor = new FakeVoiceCommandExecutor();
  return {
    executor,
    service: new VoiceCommandService(
      new FakeAsrAdapter(),
      new FakeDeepSeekAdapter(command),
      executor,
      () => now,
    ),
  };
}

describe('VoiceCommandService', () => {
  it('runs ASR and parsing, then returns a confirmation bound to the parsed command', async () => {
    const { service } = createService(schedule());
    const result = await service.analyze(audio('明天上午十点到下午三点外出'));

    expect(result.transcript).toBe('明天上午十点到下午三点外出');
    expect(result.canConfirm).toBe(true);
    expect(result.confirmationId).toBeTruthy();
    expect(result.confirmationHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not create a confirmation for an ambiguous or incomplete command', async () => {
    const { service } = createService(schedule({
      confidence: 0.45,
      endTime: null,
      missingFields: ['endTime'],
    }));
    const result = await service.analyze(audio('下午出去一下'));

    expect(result.canConfirm).toBe(false);
    expect(result.confirmationId).toBeUndefined();
    expect(result.issues).toContain('指令存在歧义，请补充或重新表达');
    expect(result.issues).toContain('缺少结束时间');
  });

  it('rejects an invalid time range before a confirmation can be created', async () => {
    const { service } = createService(schedule({ startTime: '15:00', endTime: '10:00' }));
    const result = await service.analyze(audio('下午三点到上午十点外出'));

    expect(result.canConfirm).toBe(false);
    expect(result.issues).toContain('结束时间必须晚于开始时间');
  });

  it('rejects parser output that does not match the command schema', async () => {
    const executor = new FakeVoiceCommandExecutor();
    const service = new VoiceCommandService(
      new FakeAsrAdapter(),
      { parse: async () => ({ action: 'CREATE_SCHEDULE' }) },
      executor,
    );

    await expect(service.analyze(audio('明天外出'))).rejects.toMatchObject({ code: 'INVALID_COMMAND' });
    expect(executor.calls).toHaveLength(0);
  });

  it('rejects command or hash tampering and executes an unchanged confirmation once', async () => {
    const { service, executor } = createService(schedule());
    const analyzed = await service.analyze(audio('明天上午十点到下午三点外出'));
    const base = {
      confirmationId: analyzed.confirmationId!,
      confirmationHash: analyzed.confirmationHash!,
    };

    await expect(service.confirm({ ...base, command: { ...analyzed.command, endTime: '16:00' } }))
      .rejects.toMatchObject({ code: 'CONFIRMATION_TAMPERED' });
    await expect(service.confirm({ ...base, confirmationHash: '0'.repeat(64), command: analyzed.command }))
      .rejects.toMatchObject({ code: 'CONFIRMATION_TAMPERED' });

    const first = await service.confirm({ ...base, command: analyzed.command });
    const repeated = await service.confirm({ ...base, command: analyzed.command });
    expect(first).toEqual({ executionId: 'fake-execution-1', duplicate: false });
    expect(repeated).toEqual({ executionId: 'fake-execution-1', duplicate: true });
    expect(executor.calls).toHaveLength(1);
  });
});
