import {
  canonicalUiThemeId,
  DEFAULT_UI_THEME,
  isUiThemeId,
  UI_THEMES,
  type UiThemeId,
  uiThemeById,
} from "@rakazo/ui-tokens";

export const UI_THEME_STORAGE_KEY = "rakazo.uiTheme";

export {
  canonicalUiThemeId,
  DEFAULT_UI_THEME,
  isUiThemeId,
  UI_THEMES,
  type UiThemeId,
  uiThemeById,
};

function readStoredTheme(storage: Pick<Storage, "getItem"> | null | undefined): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(UI_THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function resolveUiTheme(
  storage: Pick<Storage, "getItem"> | null = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): UiThemeId {
  return canonicalUiThemeId(readStoredTheme(storage));
}

export function persistUiTheme(
  theme: UiThemeId,
  storage: Pick<Storage, "setItem"> | null = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(UI_THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore quota / private-mode failures; in-memory theme still applies.
  }
}

export function applyUiTheme(
  theme: UiThemeId = resolveUiTheme(),
  root: {
    setAttribute: (qualifiedName: string, value: string) => void;
    style: { colorScheme: string };
  } | null = typeof document !== "undefined" ? document.documentElement : null,
): UiThemeId {
  if (!root) return theme;
  const spec = uiThemeById(theme);
  root.setAttribute("data-theme", spec.id);
  root.style.colorScheme = spec.colorScheme;
  if (typeof document !== "undefined") {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", spec.swatch);
  }
  return spec.id;
}

export function setUiTheme(theme: UiThemeId): UiThemeId {
  persistUiTheme(theme);
  return applyUiTheme(theme);
}
