import { describe, expect, it } from "vitest";
import { canonicalUiThemeId, DEFAULT_UI_THEME, isUiThemeId, UI_THEMES, uiThemeById } from "./themes.js";

describe("UI themes", () => {
  it("defaults to Claude", () => {
    expect(DEFAULT_UI_THEME).toBe("claude");
    expect(isUiThemeId("claude")).toBe(true);
    expect(isUiThemeId("grok")).toBe(true);
    expect(isUiThemeId("noir")).toBe(false);
  });

  it("maps older generic ids onto the LLM palettes", () => {
    expect(canonicalUiThemeId("midnight")).toBe("grok");
    expect(canonicalUiThemeId("sand")).toBe("claude");
    expect(canonicalUiThemeId("slate")).toBe("chatgpt");
    expect(canonicalUiThemeId("moss")).toBe("gemini");
    expect(canonicalUiThemeId("light")).toBe("claude");
  });

  it("looks up a known theme", () => {
    expect(uiThemeById("chatgpt").swatch).toBe("#212121");
    expect(uiThemeById("claude").colorScheme).toBe("light");
    expect(uiThemeById("grok").colorScheme).toBe("dark");
    expect(UI_THEMES.map((theme) => theme.id)).toEqual([
      "grok",
      "chatgpt",
      "claude",
      "gemini",
      "perplexity",
      "copilot",
    ]);
  });
});
