import { DEFAULT_UI_THEME, RK_PALETTES, UI_THEMES } from "@rakazo/ui-tokens";
import * as SecureStore from "expo-secure-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadUiTheme } from "./theme.js";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

describe("mobile theme storage", () => {
  beforeEach(() => {
    vi.mocked(SecureStore.getItemAsync).mockReset();
  });

  it("returns the stored canonical theme", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("copilot");
    await expect(loadUiTheme()).resolves.toBe("copilot");
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith("rakazo.uiTheme");
  });

  it("maps legacy ids onto the LLM palettes", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("midnight");
    await expect(loadUiTheme()).resolves.toBe("grok");
  });

  it("falls back to the default when empty, unknown, or unavailable", async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce(null);
    await expect(loadUiTheme()).resolves.toBe(DEFAULT_UI_THEME);

    vi.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("not-a-theme");
    await expect(loadUiTheme()).resolves.toBe(DEFAULT_UI_THEME);

    vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(new Error("device locked"));
    await expect(loadUiTheme()).resolves.toBe(DEFAULT_UI_THEME);
  });
});

describe("mobile palettes", () => {
  it("has a full RkPalette for every selectable theme", () => {
    for (const { id } of UI_THEMES) {
      const palette = RK_PALETTES[id];
      expect(palette, id).toBeDefined();
      for (const [key, value] of Object.entries(palette)) {
        if (key === "colorScheme") {
          expect(["light", "dark"]).toContain(value);
        } else {
          expect(value, `${id}.${key}`).toMatch(/^(#[0-9a-f]{6}|rgba\([\d\s.,]+\))$/i);
        }
      }
    }
  });
});
