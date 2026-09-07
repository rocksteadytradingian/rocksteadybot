import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isUiThemeId, UI_THEMES } from "./themes.js";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "tokens.css"), "utf8");

const CANONICAL = UI_THEMES.map((theme) => theme.id);
const TEXT_ROLES = [
  "--rk-ink",
  "--rk-body",
  "--rk-muted",
  "--rk-muted-2",
  "--rk-link",
  "--rk-danger",
  "--rk-success",
  "--rk-warning",
] as const;
const SURFACES = [
  "--rk-page",
  "--rk-sidebar",
  "--rk-main",
  "--rk-panel",
  "--rk-surface",
  "--rk-input",
] as const;

function parseThemeBlocks(source: string): Record<string, Record<string, string>> {
  const themes: Record<string, Record<string, string>> = {};
  for (const match of source.matchAll(/([^{]+)\{([^}]+)\}/g)) {
    const selector = match[1];
    const body = match[2];
    if (!selector || !body) continue;
    const ids: string[] = [];
    for (const entry of selector.matchAll(/\[data-theme="([^"]+)"\]/g)) {
      const id = entry[1];
      if (id && isUiThemeId(id)) ids.push(id);
    }
    if (ids.length === 0) continue;
    const vars: Record<string, string> = {};
    for (const line of body.split(";")) {
      const parsed = line.match(/(--rk-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/);
      const name = parsed?.[1];
      const hex = parsed?.[2];
      if (name && hex) vars[name] = hex;
    }
    for (const id of ids) themes[id] = vars;
  }
  return themes;
}

function hexToken(vars: Record<string, string>, name: string, themeId: string): string {
  const value = vars[name];
  if (!value) throw new Error(`${themeId} missing ${name}`);
  return value;
}

function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const raw = ((value >> shift) & 255) / 255;
    return raw <= 0.04045 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("theme text contrast", () => {
  const themes = parseThemeBlocks(css);

  it("defines every canonical theme", () => {
    expect(Object.keys(themes).sort()).toEqual([...CANONICAL].sort());
  });

  it("keeps primary, secondary, and status text at WCAG AA against app surfaces", () => {
    for (const [id, vars] of Object.entries(themes)) {
      for (const role of TEXT_ROLES) {
        const foreground = hexToken(vars, role, id);
        expect(foreground).toMatch(/^#[0-9a-fA-F]{6}$/);
        const minimum = role === "--rk-ink" || role === "--rk-body" ? 7 : 4.5;
        for (const surface of SURFACES) {
          const background = hexToken(vars, surface, id);
          expect(
            contrastRatio(foreground, background),
            `${id} ${role} on ${surface}`,
          ).toBeGreaterThanOrEqual(minimum);
        }
      }
    }
  });
});
