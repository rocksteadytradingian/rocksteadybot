export const UI_THEMES = [
  { id: "grok", label: "Grok", swatch: "#050506", accent: "#F4F4F5", colorScheme: "dark" },
  { id: "chatgpt", label: "ChatGPT", swatch: "#212121", accent: "#10A37F", colorScheme: "dark" },
  { id: "claude", label: "Claude", swatch: "#F4EFE6", accent: "#D97757", colorScheme: "light" },
  { id: "gemini", label: "Gemini", swatch: "#F6F8FC", accent: "#4285F4", colorScheme: "light" },
  {
    id: "perplexity",
    label: "Perplexity",
    swatch: "#0C1419",
    accent: "#20B8CD",
    colorScheme: "dark",
  },
  { id: "copilot", label: "Copilot", swatch: "#16141F", accent: "#8B7CFF", colorScheme: "dark" },
] as const;

export type UiThemeId = (typeof UI_THEMES)[number]["id"];

export const DEFAULT_UI_THEME: UiThemeId = "claude";

/** Older generic ids still stored in localStorage. */
export const UI_THEME_ALIASES: Record<string, UiThemeId> = {
  light: "claude",
  midnight: "grok",
  slate: "chatgpt",
  sand: "claude",
  moss: "gemini",
};

export function isUiThemeId(value: string | null | undefined): value is UiThemeId {
  return UI_THEMES.some((theme) => theme.id === value);
}

export function canonicalUiThemeId(value: string | null | undefined): UiThemeId {
  if (isUiThemeId(value)) return value;
  const aliased = value ? UI_THEME_ALIASES[value] : undefined;
  return aliased ?? DEFAULT_UI_THEME;
}

export function uiThemeById(id: UiThemeId) {
  return (
    UI_THEMES.find((theme) => theme.id === id) ??
    UI_THEMES.find((theme) => theme.id === DEFAULT_UI_THEME) ??
    UI_THEMES[0]
  );
}
