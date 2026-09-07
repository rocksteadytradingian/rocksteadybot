import { describe, expect, it, vi } from "vitest";
import {
  type CommandRunner,
  cleanWhisperText,
  createWhisperCliEngine,
  ffmpegResampleArgs,
  whisperCliArgs,
} from "./whisper-cli-engine.js";

describe("whisper.cpp arg builders", () => {
  it("resamples to 16 kHz mono wav from stdin", () => {
    expect(ffmpegResampleArgs("/tmp/a.wav")).toEqual([
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
      "/tmp/a.wav",
    ]);
  });

  it("asks for plain, timestamp-free text output", () => {
    expect(whisperCliArgs("/m/base.bin", "/tmp/a.wav", "/tmp/out")).toEqual([
      "-m",
      "/m/base.bin",
      "-f",
      "/tmp/a.wav",
      "-otxt",
      "-of",
      "/tmp/out",
      "-nt",
      "-l",
      "auto",
    ]);
  });
});

describe("cleanWhisperText", () => {
  it("strips timestamps and collapses whitespace", () => {
    expect(cleanWhisperText("[00:00.000 --> 00:02.000]  Hello\n there  world \n")).toBe(
      "Hello there world",
    );
  });
});

describe("createWhisperCliEngine", () => {
  it("requires a model", async () => {
    const engine = createWhisperCliEngine({ run: vi.fn() });
    await expect(engine(new Uint8Array([1]), "audio/webm")).rejects.toThrow(/RAKAZO_WHISPER_MODEL/);
  });

  it("resamples non-wav audio then runs whisper", async () => {
    const calls: string[] = [];
    const run: CommandRunner = vi.fn(async (file, args) => {
      calls.push(`${file} ${args[0]}`);
      if (file === "my-whisper") {
        const outBase = args[args.indexOf("-of") + 1];
        const { writeFile } = await import("node:fs/promises");
        await writeFile(`${outBase}.txt`, "hello there");
      }
      return { stdout: "" };
    });

    const engine = createWhisperCliEngine({
      bin: "my-whisper",
      model: "/models/base.en.bin",
      ffmpeg: "my-ffmpeg",
      run,
    });
    await expect(engine(new Uint8Array([9, 9, 9]), "audio/webm")).resolves.toEqual({
      text: "hello there",
    });
    expect(calls).toEqual(["my-ffmpeg -hide_banner", "my-whisper -m"]);
  });

  it("skips ffmpeg when the audio is already wav", async () => {
    const run: CommandRunner = vi.fn(async (file, args) => {
      if (file === "w") {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(`${args[args.indexOf("-of") + 1]}.txt`, "wav in");
      }
      return { stdout: "" };
    });
    const engine = createWhisperCliEngine({ bin: "w", model: "/m.bin", ffmpeg: "f", run });
    await engine(new Uint8Array([1]), "audio/wav");
    expect((run as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(["w"]);
  });
});
