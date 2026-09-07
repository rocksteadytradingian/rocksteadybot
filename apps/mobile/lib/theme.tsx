import {
  canonicalUiThemeId,
  DEFAULT_UI_THEME,
  RK_PALETTES,
  RK_RADIUS,
  type RkPalette,
  UI_THEMES,
  type UiThemeId,
  uiThemeById,
} from "@rakazo/ui-tokens";
import * as SecureStore from "expo-secure-store";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";

/** Same key the web UI uses in `localStorage`; here it is per-device SecureStore. */
const THEME_KEY = "rakazo.uiTheme";

/** Reads the stored theme, falling back to the default when storage is unavailable. */
export async function loadUiTheme(): Promise<UiThemeId> {
  try {
    return canonicalUiThemeId(await SecureStore.getItemAsync(THEME_KEY));
  } catch {
    return DEFAULT_UI_THEME;
  }
}

async function persistUiTheme(theme: UiThemeId): Promise<void> {
  try {
    await SecureStore.setItemAsync(THEME_KEY, theme);
  } catch {
    // SecureStore is unavailable in some test / web hosts; the in-memory theme still applies.
  }
}

export interface ThemeContextValue {
  theme: UiThemeId;
  palette: RkPalette;
  colorScheme: "light" | "dark";
  radius: number;
  setTheme: (id: UiThemeId) => void;
}

function contextValue(theme: UiThemeId, setTheme: (id: UiThemeId) => void): ThemeContextValue {
  const palette = RK_PALETTES[theme] ?? RK_PALETTES[DEFAULT_UI_THEME];
  return { theme, palette, colorScheme: palette.colorScheme, radius: RK_RADIUS, setTheme };
}

const ThemeContext = createContext<ThemeContextValue>(
  contextValue(DEFAULT_UI_THEME, () => undefined),
);

export function ThemeProvider({
  children,
  initialTheme = DEFAULT_UI_THEME,
}: {
  children: ReactNode;
  initialTheme?: UiThemeId;
}) {
  const [theme, setThemeState] = useState<UiThemeId>(() => canonicalUiThemeId(initialTheme));

  const setTheme = useCallback((id: UiThemeId) => {
    const next = canonicalUiThemeId(id);
    setThemeState(next);
    void persistUiTheme(next);
  }, []);

  const value = useMemo(() => contextValue(theme, setTheme), [theme, setTheme]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Arguments passed to a themed `StyleSheet` factory. */
export type ThemedStyleArgs = Pick<ThemeContextValue, "palette" | "colorScheme" | "radius">;

/**
 * Memoises a themed `StyleSheet` across renders, rebuilding it only when the
 * active theme changes. Define the factory at module scope so its identity is
 * stable, and call `StyleSheet.create` inside it:
 *
 * ```ts
 * const makeStyles = ({ palette }: ThemedStyleArgs) =>
 *   StyleSheet.create({ page: { backgroundColor: palette.page } });
 * // inside the component:
 * const styles = useThemedStyles(makeStyles);
 * ```
 */
export function useThemedStyles<T>(factory: (args: ThemedStyleArgs) => T): T {
  const { palette, colorScheme, radius } = useTheme();
  return useMemo(
    () => factory({ palette, colorScheme, radius }),
    [factory, palette, colorScheme, radius],
  );
}

export { type RkPalette, UI_THEMES, type UiThemeId, uiThemeById };
