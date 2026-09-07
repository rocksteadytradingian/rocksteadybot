const PANEL_BASE =
  "absolute inset-y-0 end-0 z-20 flex min-h-0 shrink-0 flex-col overflow-hidden bg-[var(--rk-panel)] transition-[width] duration-150 ease-out md:relative";

/** Narrow chat column kept beside an enlarged computer panel (sidebar is 316px). */
export const COMPUTER_PANEL_CHAT_RESERVE = "43.5rem";

export function computerSidePanelClass(show: boolean, enlarged: boolean): string {
  if (!show) return `${PANEL_BASE} pointer-events-none w-0`;
  if (enlarged) {
    return `${PANEL_BASE} w-full max-w-none border-s border-[var(--rk-surface)] md:w-[min(56rem,calc(100vw-${COMPUTER_PANEL_CHAT_RESERVE}))]`;
  }
  return `${PANEL_BASE} w-full max-w-[384px] border-s border-[var(--rk-surface)] md:w-[384px] md:max-w-none`;
}

export function computerSidePanelBodyClass(enlarged: boolean): string {
  if (enlarged) {
    return "flex h-full min-h-0 w-full flex-col overflow-hidden px-5 py-[17px]";
  }
  return "rk-scroll h-full w-full overflow-y-auto px-5 py-[17px] md:w-[384px]";
}
