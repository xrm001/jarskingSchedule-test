export const ASR_PORT = Symbol('ASR_PORT');
export const COMMAND_PARSER_PORT = Symbol('COMMAND_PARSER_PORT');
export const VOICE_COMMAND_EXECUTOR_PORT = Symbol('VOICE_COMMAND_EXECUTOR_PORT');
export interface AudioInput { bytes: Uint8Array; mimeType: 'audio/mpeg'|'audio/mp4'|'audio/aac'|'audio/wav'|'audio/webm'; originalName?: string; }
export interface AsrPort { transcribe(input: AudioInput): Promise<{text:string; providerRequestId?:string}>; }
export interface CommandParserPort { parse(input:{transcript:string;nowIso:string;timezone:'Asia/Shanghai'}):Promise<unknown>; }
export interface VoiceCommandExecutorPort {
  execute(input: {
    command: import('./voice-command.schema').VoiceCommand;
    idempotencyKey: string;
  }): Promise<{ executionId: string }>;
}
/** Production boundary: implement with Tencent Cloud SDK outside the domain service. */
export abstract class TencentAsrPort implements AsrPort { abstract transcribe(input:AudioInput):Promise<{text:string;providerRequestId?:string}>; }
/** Production boundary: implement with DeepSeek JSON-output mode outside the domain service. */
export abstract class DeepSeekCommandParserPort implements CommandParserPort { abstract parse(input:{transcript:string;nowIso:string;timezone:'Asia/Shanghai'}):Promise<unknown>; }
