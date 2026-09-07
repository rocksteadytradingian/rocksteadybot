import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalWhisperVoiceProvider, setWhisperEngine } from "./local-whisper-voice.js";

const ctx = {
  operationId: "op",
  traceId: "tr",
  workspaceId: "w",
  userId: "u",
  signal: new AbortController().signal,
};

const req = (audio = new Uint8Array([1, 2, 3])) => ({
  audio,
  mimeType: "audio/webm",
  apiKey: "",
});

afterEach(() => setWhisperEngine(undefined));

describe("LocalWhisperVoiceProvider", () => {
  it("describes a keyless, transcribe-only provider", () => {
    expect(new LocalWhisperVoiceProvider().describe()).toMatchObject({
      id: "local-whisper",
      capabilities: { catalog: false, synthesize: false, transcribe: true },
    });
  });

  it("refuses to synthesize", async () => {
    await expect(
      new LocalWhisperVoiceProvider().synthesize({ text: "hi", voiceId: "x", apiKey: "" }, ctx),
    ).rejects.toThrow(/transcribe-only/i);
  });

  it("verify and transcribe fail cleanly with no engine", async () => {
    const provider = new LocalWhisperVoiceProvider();
    await expect(provider.verify("", ctx)).resolves.toMatchObject({ ok: false });
    await expect(provider.transcribe(req(), ctx)).rejects.toThrow(/dictation isn't available/i);
  });

  it("uses an injected engine and trims its output", async () => {
    const engine = vi.fn().mockResolvedValue({ text: "  hello world \n" });
    const provider = new LocalWhisperVoiceProvider(engine);
    await expect(provider.verify("", ctx)).resolves.toEqual({ ok: true });
    await expect(provider.transcribe(req(), ctx)).resolves.toEqual({ text: "hello world" });
    expect(engine).toHaveBeenCalledWith(expect.any(Uint8Array), "audio/webm", ctx.signal);
  });

  it("falls back to the process-wide engine registered at startup", async () => {
    setWhisperEngine(async () => ({ text: "from shared" }));
    await expect(new LocalWhisperVoiceProvider().transcribe(req(), ctx)).resolves.toEqual({
      text: "from shared",
    });
  });
});
