export const DEFAULT_WARM_WINDOW_TTL_MS = 15 * 60_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
export const TITLEBAR_OVERLAY_HEIGHT = 36;

export function warmWindowTtlMs(value: string | undefined) {
  if (value === undefined || value.trim() === "") return DEFAULT_WARM_WINDOW_TTL_MS;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_TIMER_DELAY_MS
    ? parsed
    : DEFAULT_WARM_WINDOW_TTL_MS;
}

function windowChrome(platform: NodeJS.Platform) {
  const mac = platform === "darwin";
  const windows = platform === "win32";
  return {
    backgroundColor: "#050506",
    show: true,
    autoHideMenuBar: true,
    // Windows needs a real frame so snap, edge-resize, and dragging work.
    // `hidden` keeps content edge-to-edge; overlay paints native caption buttons.
    frame: mac || windows,
    titleBarStyle: mac ? ("hiddenInset" as const) : windows ? ("hidden" as const) : undefined,
    titleBarOverlay: windows
      ? { color: "#F4EFE6", symbolColor: "#2C2118", height: TITLEBAR_OVERLAY_HEIGHT }
      : undefined,
    trafficLightPosition: mac ? { x: 16, y: 16 } : undefined,
    resizable: true,
    movable: true,
    maximizable: true,
    minimizable: true,
    closable: true,
    minWidth: 800,
    minHeight: 560,
  };
}

export function browserWindowOptions(platform: NodeJS.Platform) {
  return { ...windowChrome(platform), width: 1440, height: 900 };
}

/** The first-run setup window is smaller and keeps the same window chrome. */
export function setupWindowOptions(platform: NodeJS.Platform) {
  return { ...windowChrome(platform), width: 720, height: 700, minWidth: 480, minHeight: 560 };
}
