import { execFile } from "node:child_process";
import { join } from "node:path";
import type { PlaywrightMcpOptions } from "./playwright-mcp-driver.js";

/**
 * Turn "operator installed `@playwright/mcp` and set (or didn't) a few env vars" into driver
 * options, without forcing every var. Env wins when set. The PATH probe is injected so this
 * resolves offline in tests.
 *
 * - `RAKAZO_PLAYWRIGHT_MCP_BIN` — executable; else `mcp-server-playwright` / `playwright-mcp`
 *   on PATH. No bin → null (browser surface stays off).
 * - `RAKAZO_PLAYWRIGHT_MCP_ARGS` — extra space-separated CLI args.
 * - `RAKAZO_BROWSER_PROFILE_DIR` — root for per-profile dirs; else `<dataDir>/browser-profiles`.
 * - `RAKAZO_BROWSER_HEADLESS` — `1`/`true` to run without a window.
 */

const BIN_CANDIDATES = ["mcp-server-playwright", "playwright-mcp"];

export interface PlaywrightMcpAutodetectDeps {
  env?: NodeJS.ProcessEnv;
  lookPath?: (name: string) => Promise<string | null>;
}

export async function resolvePlaywrightMcp(
  input: { dataDir: string },
  deps: PlaywrightMcpAutodetectDeps = {},
): Promise<PlaywrightMcpOptions | null> {
  const env = deps.env ?? process.env;
  const lookPath = deps.lookPath ?? defaultLookPath;

  let command = env.RAKAZO_PLAYWRIGHT_MCP_BIN?.trim() || null;
  if (!command) {
    for (const candidate of BIN_CANDIDATES) {
      const found = await lookPath(candidate);
      if (found) {
        command = found;
        break;
      }
    }
  }
  if (!command) return null;

  const profileRoot =
    env.RAKAZO_BROWSER_PROFILE_DIR?.trim() || join(input.dataDir, "browser-profiles");
  const extraArgs = (env.RAKAZO_PLAYWRIGHT_MCP_ARGS?.trim() || "").split(/\s+/).filter(Boolean);
  const headless = /^(1|true|yes)$/i.test(env.RAKAZO_BROWSER_HEADLESS?.trim() ?? "");

  return {
    command,
    args: extraArgs,
    headless,
    profileDir: (profileId: string) => join(profileRoot, sanitizeProfileId(profileId)),
  };
}

/** Keep a profile id to one safe path segment. */
export function sanitizeProfileId(profileId: string): string {
  const cleaned = profileId
    .replace(/[^A-Za-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "default";
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
