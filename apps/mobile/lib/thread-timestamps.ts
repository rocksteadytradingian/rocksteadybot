const DAY_MS = 86_400_000;
/** Consecutive messages further apart than this get a centered time separator between them. */
const BREAK_GAP_MS = 10 * 60_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Clock time shown under a single message, e.g. "3:45 PM". Prefixes a weekday within the past week. */
export function formatMessageClock(iso: string | undefined, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (dayDiff <= 0 || dayDiff >= 7) return time;
  return `${date.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
}

/**
 * Centered separator label: bare time today ("3:19 PM"), otherwise the day plus
 * the time ("Yesterday 3:19 PM", "Wed 3:19 PM", "Jul 24, 3:19 PM", and with the
 * year once it is not the current one).
 */
export function formatMessageBreak(iso: string | undefined, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (dayDiff === 0) return time;
  if (dayDiff === 1) return `Yesterday ${time}`;
  if (dayDiff > 1 && dayDiff < 7) {
    return `${date.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${day}, ${time}`;
}

/**
 * Whether to place a centered time separator before `iso`: always before the
 * first message, whenever the calendar day changes, and once a gap of ten
 * minutes or more opens between two messages.
 */
export function shouldBreakBefore(prevIso: string | undefined, iso: string | undefined): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  if (!prevIso) return true;
  const prev = new Date(prevIso);
  if (Number.isNaN(prev.getTime())) return true;
  if (startOfDay(prev) !== startOfDay(date)) return true;
  return date.getTime() - prev.getTime() >= BREAK_GAP_MS;
}
