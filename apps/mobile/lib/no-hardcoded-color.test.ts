import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(mobileRoot, "..", "..");
const ROOTS = [join(mobileRoot, "app"), join(mobileRoot, "components")];

/**
 * Shared modules that only render on mobile (`.native` entry points) and must
 * follow the same rule: colour from the active theme's `palette`, never a
 * literal. The chat markdown renderer is the whole bot transcript.
 */
const NATIVE_SHARED_FILES = [join(repoRoot, "packages", "chat-ui", "src", "markdown.native.tsx")];

/**
 * Screens must colour themselves from the active theme's `palette` (see
 * `lib/theme.tsx`), never with literal hex. These files keep a few literals for
 * a documented reason:
 *  - bot-avatar.tsx: the robot-face illustration (visor + eyes) is fixed art,
 *    drawn on top of the bot's identity colour, and reads in any theme.
 *  - _layout.tsx: one dark rectangle shown for the SecureStore round-trip before
 *    the ThemeProvider mounts, matching the splash screen.
 */
const ALLOW_FILES = new Set(["bot-avatar.tsx", "_layout.tsx"]);

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB = /\brgba?\(/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe("mobile theme tokens", () => {
  it("never hardcodes colours in screens or components", () => {
    const hits: string[] = [];
    for (const file of [...ROOTS.flatMap(walk), ...NATIVE_SHARED_FILES]) {
      if (ALLOW_FILES.has(file.split(/[/\\]/).pop() ?? "")) continue;
      const source = readFileSync(file, "utf8");
      const rel = relative(repoRoot, file).replaceAll("\\", "/");
      for (const match of source.match(HEX) ?? []) hits.push(`${rel}: ${match}`);
      if (RGB.test(source)) hits.push(`${rel}: rgb()/rgba() literal`);
    }
    expect(hits).toEqual([]);
  });
});
