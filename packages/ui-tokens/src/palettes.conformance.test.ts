import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RK_PALETTES, type RkPalette, rkCssVar } from "./palettes.js";
import { isUiThemeId, UI_THEMES } from "./themes.js";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "tokens.css"), "utf8");

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
      const parsed = line.match(/(--rk-[\w-]+)\s*:\s*([^;]+)/);
      const name = parsed?.[1];
      const value = parsed?.[2]?.trim();
      if (name && value) vars[name] = value;
    }
    const scheme = body.match(/color-scheme\s*:\s*(light|dark)/)?.[1];
    if (scheme) vars["color-scheme"] = scheme;
    for (const id of ids) themes[id] = vars;
  }
  return themes;
}

const cssThemes = parseThemeBlocks(css);
const colourKeys = Object.keys(RK_PALETTES.claude).filter(
  (key): key is keyof Omit<RkPalette, "colorScheme"> => key !== "colorScheme",
);

describe("RK_PALETTES conformance with tokens.css", () => {
  it("covers every canonical theme", () => {
    expect(Object.keys(RK_PALETTES).sort()).toEqual(UI_THEMES.map((t) => t.id).sort());
  });

  for (const { id } of UI_THEMES) {
    describe(id, () => {
      const cssVars = cssThemes[id];
      const palette = RK_PALETTES[id];

      it("has a matching CSS block", () => {
        expect(cssVars, `tokens.css is missing [data-theme="${id}"]`).toBeDefined();
      });

      it("matches color-scheme", () => {
        expect(palette.colorScheme).toBe(cssVars?.["color-scheme"]);
        expect(palette.colorScheme).toBe(UI_THEMES.find((t) => t.id === id)?.colorScheme);
      });

      for (const key of colourKeys) {
        it(`matches ${rkCssVar(key)}`, () => {
          const cssValue = cssVars?.[rkCssVar(key)];
          expect(
            cssValue,
            `tokens.css [data-theme="${id}"] missing ${rkCssVar(key)}`,
          ).toBeDefined();
          expect(palette[key].toLowerCase().replace(/\s+/g, " ")).toBe(
            cssValue?.toLowerCase().replace(/\s+/g, " "),
          );
        });
      }
    });
  }
});
