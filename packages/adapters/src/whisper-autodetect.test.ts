import { describe, expect, it, vi } from "vitest";
import { resolveWhisperSetup } from "./whisper-autodetect.js";

describe("resolveWhisperSetup", () => {
  it("uses the env vars verbatim when they are set, without probing", async () => {
    const lookPath = vi.fn(async () => "/never");
    const findModel = vi.fn(async () => "/never/model.bin");
    const result = await resolveWhisperSetup(
      { dataDir: "/data" },
      {
        env: {
          RAKAZO_WHISPER_BIN: "/opt/whisper-cli",
          RAKAZO_WHISPER_MODEL: "/opt/ggml-base.bin",
          RAKAZO_FFMPEG_BIN: "/opt/ffmpeg",
        } as NodeJS.ProcessEnv,
        lookPath,
        findModel,
      },
    );
    expect(result).toEqual({
      bin: "/opt/whisper-cli",
      model: "/opt/ggml-base.bin",
      ffmpeg: "/opt/ffmpeg",
    });
    expect(lookPath).not.toHaveBeenCalled();
    expect(findModel).not.toHaveBeenCalled();
  });

  it("finds the binary on PATH and the model in the data dir", async () => {
    const result = await resolveWhisperSetup(
      { dataDir: "/data" },
      {
        env: {} as NodeJS.ProcessEnv,
        lookPath: vi.fn(async (name) =>
          name === "whisper-cli"
            ? "/usr/local/bin/whisper-cli"
            : name === "ffmpeg"
              ? "/usr/bin/ffmpeg"
              : null,
        ),
        findModel: vi.fn(async () => "/data/whisper/ggml-small.bin"),
      },
    );
    expect(result).toEqual({
      bin: "/usr/local/bin/whisper-cli",
      model: "/data/whisper/ggml-small.bin",
      ffmpeg: "/usr/bin/ffmpeg",
    });
  });

  it("returns null when no whisper binary is on PATH", async () => {
    const result = await resolveWhisperSetup(
      { dataDir: "/data" },
      {
        env: {} as NodeJS.ProcessEnv,
        lookPath: vi.fn(async () => null),
        findModel: vi.fn(async () => "/m"),
      },
    );
    expect(result).toBeNull();
  });

  it("returns null when a binary is found but there is no model", async () => {
    const result = await resolveWhisperSetup(
      { dataDir: "/data" },
      {
        env: {} as NodeJS.ProcessEnv,
        lookPath: vi.fn(async () => "/usr/bin/whisper"),
        findModel: vi.fn(async () => null),
      },
    );
    expect(result).toBeNull();
  });

  it("falls back to the bare 'ffmpeg' name when it is not on PATH", async () => {
    const result = await resolveWhisperSetup(
      { dataDir: "/data" },
      {
        env: {} as NodeJS.ProcessEnv,
        lookPath: vi.fn(async (name) => (name === "whisper" ? "/usr/bin/whisper" : null)),
        findModel: vi.fn(async () => "/data/whisper/ggml-base.bin"),
      },
    );
    expect(result?.ffmpeg).toBe("ffmpeg");
  });
});
