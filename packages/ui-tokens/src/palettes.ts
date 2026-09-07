import type { UiThemeId } from "./themes.js";

/**
 * Machine-readable mirror of the `--rk-*` custom properties in `tokens.css`, one
 * entry per canonical theme. The web/Electron UI keeps consuming the CSS
 * variables; React Native (which cannot read CSS) consumes this instead. The
 * `palettes.conformance.test.ts` suite asserts the two stay byte-identical.
 */
export interface RkPalette {
  colorScheme: "light" | "dark";
  page: string;
  sidebar: string;
  main: string;
  panel: string;
  input: string;
  hairline: string;
  hairlineStrong: string;
  surface: string;
  surface2: string;
  hover: string;
  ink: string;
  body: string;
  muted: string;
  muted2: string;
  solid: string;
  solidInk: string;
  user: string;
  userInk: string;
  accent: string;
  accentInk: string;
  link: string;
  danger: string;
  dangerInk: string;
  success: string;
  successSoft: string;
  warning: string;
  queued: string;
  overlay: string;
  scrollbar: string;
  mark: string;
  markDot: string;
}

/** Corner radius shared by every theme (`--rk-radius: 0.75rem`), in points. */
export const RK_RADIUS = 12;

/** Maps an {@link RkPalette} colour key to its `--rk-*` custom-property name. */
export function rkCssVar(key: keyof Omit<RkPalette, "colorScheme">): string {
  return `--rk-${key.replace(/([A-Z0-9])/g, "-$1").toLowerCase()}`;
}

export const RK_PALETTES: Record<UiThemeId, RkPalette> = {
  grok: {
    colorScheme: "dark",
    page: "#050506",
    sidebar: "#0b0b0c",
    main: "#0d0d0e",
    panel: "#0a0a0b",
    input: "#101012",
    hairline: "#171719",
    hairlineStrong: "#3a3a40",
    surface: "#141416",
    surface2: "#1a1a1d",
    hover: "#232327",
    ink: "#ececee",
    body: "#dfdfe2",
    muted: "#a3a3a8",
    muted2: "#8e8e94",
    solid: "#f1f1ef",
    solidInk: "#17171a",
    user: "#f1f1ef",
    userInk: "#1a1a1a",
    accent: "#f4f4f5",
    accentInk: "#17171a",
    link: "#a8b8ff",
    danger: "#ff7a3d",
    dangerInk: "#1a0c08",
    success: "#4ecb71",
    successSoft: "#4ecb71",
    warning: "#f5a03c",
    queued: "#c4b5fd",
    overlay: "rgba(4, 4, 5, 0.62)",
    scrollbar: "#2a2a2e",
    mark: "#16161a",
    markDot: "#f7f7f4",
  },
  chatgpt: {
    colorScheme: "dark",
    page: "#212121",
    sidebar: "#171717",
    main: "#212121",
    panel: "#171717",
    input: "#2f2f2f",
    hairline: "#2f2f2f",
    hairlineStrong: "#3e3e3e",
    surface: "#2f2f2f",
    surface2: "#2a2a2a",
    hover: "#3e3e3e",
    ink: "#ececec",
    body: "#e4e4e4",
    muted: "#b4b4b4",
    muted2: "#a0a0a0",
    solid: "#ececec",
    solidInk: "#171717",
    user: "#323232",
    userInk: "#ececec",
    accent: "#10a37f",
    accentInk: "#061510",
    link: "#3ecf9f",
    danger: "#ff8a65",
    dangerInk: "#1a0c08",
    success: "#4ecb71",
    successSoft: "#4ecb71",
    warning: "#f5a03c",
    queued: "#c4b5fd",
    overlay: "rgba(10, 10, 10, 0.58)",
    scrollbar: "#4a4a4a",
    mark: "#ececec",
    markDot: "#171717",
  },
  claude: {
    colorScheme: "light",
    page: "#f4efe6",
    sidebar: "#ebe4d6",
    main: "#f7f3eb",
    panel: "#fbf8f2",
    input: "#fffdf8",
    hairline: "#d8cbb8",
    hairlineStrong: "#c4b498",
    surface: "#fffdf8",
    surface2: "#ebe4d6",
    hover: "#ddd2c0",
    ink: "#2c2118",
    body: "#3e3428",
    muted: "#5c4e3e",
    muted2: "#6a5a48",
    solid: "#3a2e24",
    solidInk: "#fbf8f2",
    user: "#3a2e24",
    userInk: "#f7f3eb",
    accent: "#d97757",
    accentInk: "#fffdf8",
    link: "#a34b2e",
    danger: "#9a3412",
    dangerInk: "#fffdf8",
    success: "#166534",
    successSoft: "#2f9a4c",
    warning: "#92400e",
    queued: "#6d28d9",
    overlay: "rgba(40, 28, 16, 0.38)",
    scrollbar: "#c8b8a0",
    mark: "#3a2e24",
    markDot: "#f4efe6",
  },
  gemini: {
    colorScheme: "light",
    page: "#f6f8fc",
    sidebar: "#e8eef6",
    main: "#f8fafd",
    panel: "#ffffff",
    input: "#ffffff",
    hairline: "#c5d0de",
    hairlineStrong: "#9aabc0",
    surface: "#ffffff",
    surface2: "#e8eef6",
    hover: "#d8e2ee",
    ink: "#1a2332",
    body: "#2c3a4c",
    muted: "#3d4e60",
    muted2: "#4e6174",
    solid: "#1a73e8",
    solidInk: "#ffffff",
    user: "#1a73e8",
    userInk: "#ffffff",
    accent: "#4285f4",
    accentInk: "#ffffff",
    link: "#1558c0",
    danger: "#9a3412",
    dangerInk: "#ffffff",
    success: "#166534",
    successSoft: "#2f9a4c",
    warning: "#92400e",
    queued: "#5b21b6",
    overlay: "rgba(20, 32, 48, 0.36)",
    scrollbar: "#c0ccd8",
    mark: "#1a73e8",
    markDot: "#f6f8fc",
  },
  perplexity: {
    colorScheme: "dark",
    page: "#0c1419",
    sidebar: "#111b22",
    main: "#0e181e",
    panel: "#0d161c",
    input: "#1a2830",
    hairline: "#1e2e38",
    hairlineStrong: "#2a3e4a",
    surface: "#1a2830",
    surface2: "#162228",
    hover: "#243640",
    ink: "#e8f4f6",
    body: "#c8dce0",
    muted: "#9ab4ba",
    muted2: "#7a969c",
    solid: "#20b8cd",
    solidInk: "#062026",
    user: "#163a42",
    userInk: "#e8f8fa",
    accent: "#20b8cd",
    accentInk: "#062026",
    link: "#4ec8d8",
    danger: "#ff8a65",
    dangerInk: "#1a0c08",
    success: "#4ecb71",
    successSoft: "#4ecb71",
    warning: "#f0b429",
    queued: "#c4b5fd",
    overlay: "rgba(6, 14, 18, 0.6)",
    scrollbar: "#2a3e4a",
    mark: "#20b8cd",
    markDot: "#0c1419",
  },
  copilot: {
    colorScheme: "dark",
    page: "#16141f",
    sidebar: "#1c1828",
    main: "#181624",
    panel: "#14121c",
    input: "#262238",
    hairline: "#2e2a42",
    hairlineStrong: "#3e3858",
    surface: "#262238",
    surface2: "#221e32",
    hover: "#342e4c",
    ink: "#f0edff",
    body: "#d4d0e8",
    muted: "#b8b2d4",
    muted2: "#a49ec0",
    solid: "#8b7cff",
    solidInk: "#16141f",
    user: "#2a2440",
    userInk: "#f0edff",
    accent: "#8b7cff",
    accentInk: "#16141f",
    link: "#a99aff",
    danger: "#ff8a65",
    dangerInk: "#1a0c08",
    success: "#4ecb71",
    successSoft: "#4ecb71",
    warning: "#f5a03c",
    queued: "#c4b5fd",
    overlay: "rgba(10, 8, 18, 0.6)",
    scrollbar: "#3e3858",
    mark: "#8b7cff",
    markDot: "#16141f",
  },
};

export function rkPaletteById(id: UiThemeId): RkPalette {
  return RK_PALETTES[id] ?? RK_PALETTES.claude;
}
