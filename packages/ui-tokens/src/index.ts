/** Snapshot of the default Claude theme. Web UI should use `--rk-*` CSS variables. */
export const tokens = {
  page: "#f4efe6",
  sidebar: "#ebe4d6",
  main: "#f7f3eb",
  panel: "#fbf8f2",
  hairline: "#d8cbb8",
  hairlineStrong: "#c4b498",
  surface: "#fffdf8",
  surface2: "#ebe4d6",
  ink: "#2c2118",
  body: "#3e3428",
  muted: "#5c4e3e",
  muted2: "#6a5a48",
  cream: "#3a2e24",
  creamInk: "#fbf8f2",
  accent: "#d97757",
  danger: "#9a3412",
  success: "#166534",
  successSoft: "#2f9a4c",
} as const;

export const botColors = [
  "#3EC5A8",
  "#F5A03C",
  "#6A6BF5",
  "#9B5CF6",
  "#3B82F6",
  "#F2622A",
  "#D9508A",
] as const;

export {
  canonicalUiThemeId,
  DEFAULT_UI_THEME,
  isUiThemeId,
  UI_THEME_ALIASES,
  UI_THEMES,
  type UiThemeId,
  uiThemeById,
} from "./themes.js";
