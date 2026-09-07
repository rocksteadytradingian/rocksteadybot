import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { WhisperCliOptions } from "./whisper-cli-engine.js";

/**
 * Turn "operator installed whisper.cpp + ffmpeg and dropped a ggml model in the data dir"
 * into a wired engine, without making them set three env vars. Env vars still win when set.
 * The probes are injected so this resolves offline in tests.
 */

const WHISPER_BIN_CANDIDATES = ["whisper-cli", "whisper", "main"];
const MODEL_DIR = "whisper";
const MODEL_PATTERN = /^ggml-.*\.bin$/;

export interface WhisperAutodetectDeps {
  env?: NodeJS.ProcessEnv;
  /** Resolve a command name to a path, or null if not on PATH. */
  lookPath?: (name: string) => Promise<string | null>;
  /** Newest matching ggml model file in `<dataDir>/whisper/`, or null. */
  findModel?: (dataDir: string) => Promise<string | null>;
}

/** Returns options ready for `createWhisperCliEngine`, or null when on-device STT can't run. */
export async function resolveWhisperSetup(
  input: { dataDir: string },
  deps: WhisperAutodetectDeps = {},
): Promise<WhisperCliOptions | null> {
  const env = deps.env ?? process.env;
  const lookPath = deps.lookPath ?? defaultLookPath;
  const findModel = deps.findModel ?? defaultFindModel;

  let bin = env.RAKAZO_WHISPER_BIN?.trim() || null;
  if (!bin) {
    for (const candidate of WHISPER_BIN_CANDIDATES) {
      const found = await lookPath(candidate);
      if (found) {
        bin = found;
        break;
      }
    }
  }
  if (!bin) return null;

  const model = env.RAKAZO_WHISPER_MODEL?.trim() || (await findModel(input.dataDir));
  if (!model) return null;

  const ffmpeg = env.RAKAZO_FFMPEG_BIN?.trim() || (await lookPath("ffmpeg")) || "ffmpeg";

  return { bin, model, ffmpeg };
}

const defaultLookPath = (name: string): Promise<string | null> =>
  new Promise((resolve) => {
    const probe = process.platform === "win32" ? "where" : "which";
    execFile(probe, [name], (error, stdout) => {
      if (error) return resolve(null);
      const first = stdout.split(/\r?\n/).find((line) => line.trim());
      resolve(first ? first.trim() : null);
    });
  });

async function defaultFindModel(dataDir: string): Promise<string | null> {
  const dir = join(dataDir, MODEL_DIR);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const models = names.filter((name) => MODEL_PATTERN.test(name));
  if (models.length === 0) return null;

  const withMtime = await Promise.all(
    models.map(async (name) => {
      const full = join(dir, name);
      try {
        return { full, mtimeMs: (await stat(full)).mtimeMs };
      } catch {
        return { full, mtimeMs: 0 };
      }
    }),
  );
  withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withMtime[0]?.full ?? null;
}
