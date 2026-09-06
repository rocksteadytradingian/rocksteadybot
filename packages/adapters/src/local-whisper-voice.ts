import type {
  AdapterContext,
  AdapterDescriptor,
  SpeechClip,
  VoiceCapabilities,
  VoiceInfo,
  VoiceProvider,
  VoiceSynthesizeRequest,
  VoiceTranscribeRequest,
  VoiceVerifyResult,
} from "@rakazo/adapter-kit";

/**
 * Turns speech audio into text on this machine. The deployment supplies it at startup
 * (whisper.cpp, transformers.js, …) via {@link setWhisperEngine}; absent means on-device
 * dictation is not available here.
 */
export type WhisperEngine = (
  audio: Uint8Array,
  mimeType: string,
  signal?: AbortSignal,
) => Promise<{ text: string }>;

let sharedEngine: WhisperEngine | undefined;

/** Register (or clear) the process-wide on-device speech engine. Call once, at startup. */
export function setWhisperEngine(engine: WhisperEngine | undefined): void {
  sharedEngine = engine;
}

const UNAVAILABLE =
  "On-device dictation isn't available in this deployment. It needs the desktop app with the local speech pack.";

/**
 * On-device speech-to-text. Transcribe-only, no API key, no network. It works only where a
 * {@link WhisperEngine} has been registered (the desktop app); elsewhere `verify` fails
 * cleanly and the catalog entry is effectively disabled.
 */
export class LocalWhisperVoiceProvider implements VoiceProvider {
  constructor(private readonly engine?: WhisperEngine) {}

  describe(): AdapterDescriptor<VoiceCapabilities> {
    return {
      id: "local-whisper",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { catalog: false, synthesize: false, transcribe: true },
    };
  }

  async verify(_apiKey: string, _context: AdapterContext): Promise<VoiceVerifyResult> {
    return this.resolve() ? { ok: true } : { ok: false, message: UNAVAILABLE };
  }

  async listVoices(_apiKey: string, _context: AdapterContext): Promise<VoiceInfo[]> {
    return [];
  }

  async synthesize(
    _request: VoiceSynthesizeRequest,
    _context: AdapterContext,
  ): Promise<SpeechClip> {
    throw new Error(
      "local-whisper is transcribe-only. Pick elevenlabs | openai | cartesia to have a bot speak.",
    );
  }

  async transcribe(
    request: VoiceTranscribeRequest,
    context: AdapterContext,
  ): Promise<{ text: string }> {
    const engine = this.resolve();
    if (!engine) throw new Error(UNAVAILABLE);
    const { text } = await engine(
      request.audio,
      request.mimeType,
      request.signal ?? context.signal,
    );
    return { text: text.trim() };
  }

  /** Prefer an explicitly injected engine (tests); otherwise the process-wide one. */
  private resolve(): WhisperEngine | undefined {
    return this.engine ?? sharedEngine;
  }
}
