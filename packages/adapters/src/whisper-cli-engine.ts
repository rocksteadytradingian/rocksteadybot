import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WhisperEngine } from "./local-whisper-voice.js";

/**
 * Runs an external command, feeding `stdin` if given, and resolves its stdout. Injected so the
 * engine's argument-building and output-parsing can be tested without real binaries.
 */
export type CommandRunner = (
  file: string,
  args: string[],
  options: { stdin?: Uint8Array; signal?: AbortSignal },
) => Promise<{ stdout: string }>;

export interface WhisperCliOptions {
  /** whisper.cpp CLI (`whisper-cli` / `main`). Defaults to `$RAKAZO_WHISPER_BIN` or `whisper-cli`. */
  bin?: string;
  /** ggml model file. Defaults to `$RAKAZO_WHISPER_MODEL`. */
  model?: string;
  /** ffmpeg, to resample recordings to 16 kHz mono WAV. Defaults to `$RAKAZO_FFMPEG_BIN` or `ffmpeg`. */
  ffmpeg?: string;
  run?: CommandRunner;
}

const defaultRunner: CommandRunner = (file, args, { stdin, signal }) =>
  new Promise((resolve, reject) => {
    const child = execFile(file, args, { signal, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve({ stdout });
    });
    if (stdin) {
      child.stdin?.end(Buffer.from(stdin));
    }
  });

/** Args to resample any recording to what whisper.cpp wants: 16 kHz, mono, 16-bit PCM WAV. */
export function ffmpegResampleArgs(outWav: string): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "pipe:0",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-f",
    "wav",
    "-y",
    outWav,
  ];
}

/** Args for a plain-text, timestamp-free transcription written to `<outBase>.txt`. */
export function whisperCliArgs(model: string, wav: string, outBase: string): string[] {
  return ["-m", model, "-f", wav, "-otxt", "-of", outBase, "-nt", "-l", "auto"];
}

/** whisper.cpp text output: collapse the newlines it inserts per segment into one line. */
export function cleanWhisperText(raw: string): string {
  return raw
    .replace(/\s*\[[0-9:.]+\s*-->\s*[0-9:.]+\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A {@link WhisperEngine} that shells out to a whisper.cpp binary. Nothing is bundled — the
 * deployment provides the binary and a model (and ffmpeg for audio that isn't already WAV).
 * Wire it in the composition root when `RAKAZO_WHISPER_BIN` + `RAKAZO_WHISPER_MODEL` are set.
 */
export function createWhisperCliEngine(options: WhisperCliOptions = {}): WhisperEngine {
  const bin = options.bin ?? process.env.RAKAZO_WHISPER_BIN ?? "whisper-cli";
  const model = options.model ?? process.env.RAKAZO_WHISPER_MODEL ?? "";
  const ffmpeg = options.ffmpeg ?? process.env.RAKAZO_FFMPEG_BIN ?? "ffmpeg";
  const run = options.run ?? defaultRunner;

  return async (audio, mimeType, signal) => {
    if (!model) throw new Error("Set RAKAZO_WHISPER_MODEL to a ggml model file.");
    const dir = await mkdtemp(join(tmpdir(), "rakazo-whisper-"));
    const wav = join(dir, "audio.wav");
    const outBase = join(dir, "out");
    try {
      if (isWav(mimeType)) {
        await writeFile(wav, Buffer.from(audio));
      } else {
        await run(ffmpeg, ffmpegResampleArgs(wav), { stdin: audio, signal });
      }
      await run(bin, whisperCliArgs(model, wav, outBase), { signal });
      return { text: cleanWhisperText(await readFile(`${outBase}.txt`, "utf8")) };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  };
}

function isWav(mimeType: string): boolean {
  return /wav|x-wav|wave/i.test(mimeType);
}
