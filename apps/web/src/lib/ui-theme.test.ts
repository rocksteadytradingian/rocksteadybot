import { describe, expect, it } from "vitest";
import { applyUiTheme, persistUiTheme, resolveUiTheme, UI_THEME_STORAGE_KEY } from "./ui-theme";

describe("resolveUiTheme", () => {
  it("uses the saved theme when it is valid", () => {
    const storage = {
      getItem: (key: string) => (key === UI_THEME_STORAGE_KEY ? "chatgpt" : null),
    };
    expect(resolveUiTheme(storage)).toBe("chatgpt");
  });

  it("maps legacy generic ids", () => {
    const storage = {
      getItem: (key: string) => (key === UI_THEME_STORAGE_KEY ? "sand" : null),
    };
    expect(resolveUiTheme(storage)).toBe("claude");
  });

  it("falls back to Claude for missing or unknown values", () => {
    expect(resolveUiTheme({ getItem: () => null })).toBe("claude");
    expect(resolveUiTheme({ getItem: () => "noir" })).toBe("claude");
  });
});

describe("persistUiTheme", () => {
  it("writes the theme id", () => {
    const written: Record<string, string> = {};
    persistUiTheme("chatgpt", { setItem: (key, value) => (written[key] = value) });
    expect(written[UI_THEME_STORAGE_KEY]).toBe("chatgpt");
  });
});

describe("applyUiTheme", () => {
  it("sets data-theme and color-scheme on the root", () => {
    const attrs: Record<string, string> = {};
    const style = { colorScheme: "" };
    applyUiTheme("gemini", {
      setAttribute: (name, value) => {
        attrs[name] = value;
      },
      style,
    });
    expect(attrs["data-theme"]).toBe("gemini");
    expect(style.colorScheme).toBe("light");
  });
});
