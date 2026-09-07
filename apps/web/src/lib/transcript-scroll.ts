export function transcriptIsNearEnd(
  element: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 80;
}

export function scrollTranscriptToEnd(element: { scrollTop: number; scrollHeight: number }): void {
  element.scrollTop = element.scrollHeight;
}

/**
 * Programmatic pins (new messages, streaming growth, jump-to-latest) must keep
 * following even when the viewport has not yet caught the latest height.
 */
export function transcriptFollowAfterScroll(input: {
  nearEnd: boolean;
  programmatic: boolean;
}): boolean {
  if (input.programmatic) return true;
  return input.nearEnd;
}
