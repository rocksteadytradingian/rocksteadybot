/** Distance from the bottom that still counts as “following” live chat. */
export const TRANSCRIPT_STICK_PX = 160;

export function isTranscriptNearBottom(
  element: { scrollTop: number; scrollHeight: number; clientHeight: number },
  thresholdPx = TRANSCRIPT_STICK_PX,
): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= thresholdPx;
}

export function scrollTranscriptToBottom(element: {
  scrollTop: number;
  scrollHeight: number;
}): void {
  element.scrollTop = element.scrollHeight;
}
