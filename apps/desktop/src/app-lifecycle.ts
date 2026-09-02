/** Last-window close must not quit while startup still has work to do. */
export function shouldQuitWhenAllWindowsClosed(
  platform: NodeJS.Platform,
  options: { launching: boolean; quitting: boolean },
): boolean {
  if (platform === "darwin") return false;
  if (options.quitting) return true;
  if (options.launching) return false;
  return true;
}
