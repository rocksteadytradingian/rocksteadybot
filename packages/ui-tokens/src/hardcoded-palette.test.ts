import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const ROOTS = [join(repoRoot, "apps/web/src"), join(repoRoot, "packages/ui-web/src")];

const ALLOW_FILES = new Set([
  "WindowChrome.tsx",
  "button.test.tsx",
  "hardcoded-palette.test.ts",
  "bot-avatar.tsx",
  "bot-avatar.test.tsx",
  "group-avatar.test.tsx",
]);

/** Grok-only chrome that disappears on Claude/Gemini if used as text or surfaces. */
const FORBIDDEN = [
  "#ECECEE",
  "#F1F1F2",
  "#85858A",
  "#6C6C70",
  "#C9C9CE",
  "#141416",
  "#101012",
  "#161618",
  "#1A1A1D",
  "#26262A",
  "#0B0B0D",
  "#0E0E10",
  "#121214",
  "#0D0D0E",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (/\.(tsx|ts|css)$/.test(entry.name) && !ALLOW_FILES.has(entry.name)) out.push(path);
  }
  return out;
}

describe("theme tokens", () => {
  it("does not hardcode the Grok chrome palette in web UI", () => {
    const hits: string[] = [];
    for (const file of ROOTS.flatMap(walk)) {
      const source = readFileSync(file, "utf8");
      for (const hex of FORBIDDEN) {
        if (source.toLowerCase().includes(hex.toLowerCase())) {
          hits.push(`${relative(repoRoot, file).replaceAll("\\", "/")} contains ${hex}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
