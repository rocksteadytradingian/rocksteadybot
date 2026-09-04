import { describe, expect, it } from "vitest";
import { formatMessageBreak, formatMessageClock, shouldBreakBefore } from "./thread-timestamps.js";

const now = new Date(2026, 7, 13, 21, 53, 0);

describe("formatMessageClock", () => {
  it("shows a bare clock time for today", () => {
    expect(formatMessageClock(local(now, 0, 14, 44), now)).toBe("2:44 PM");
  });

  it("prefixes the weekday within the past week", () => {
    expect(formatMessageClock(local(now, 2, 9, 5), now)).toBe("Tue 9:05 AM");
  });

  it("drops the weekday once older than a week", () => {
    expect(formatMessageClock(local(now, 20, 9, 0), now)).toBe("9:00 AM");
  });

  it("returns nothing for a missing or invalid timestamp", () => {
    expect(formatMessageClock(undefined, now)).toBe("");
    expect(formatMessageClock("not-a-date", now)).toBe("");
  });
});

describe("formatMessageBreak", () => {
  it("shows only the time for today", () => {
    expect(formatMessageBreak(local(now, 0, 15, 19), now)).toBe("3:19 PM");
  });

  it("prefixes Yesterday and the weekday earlier in the week", () => {
    expect(formatMessageBreak(local(now, 1, 15, 19), now)).toBe("Yesterday 3:19 PM");
    expect(formatMessageBreak(local(now, 3, 8, 0), now)).toBe("Mon 8:00 AM");
  });

  it("uses a short date within the year and adds the year beyond it", () => {
    expect(formatMessageBreak(local(now, 20, 9, 0), now)).toBe("Jul 24, 9:00 AM");
    expect(formatMessageBreak(local(now, 400, 9, 0), now)).toBe("Jul 9, 2025, 9:00 AM");
  });

  it("returns nothing for a missing or invalid timestamp", () => {
    expect(formatMessageBreak(undefined, now)).toBe("");
    expect(formatMessageBreak("nope", now)).toBe("");
  });
});

describe("shouldBreakBefore", () => {
  it("always breaks before the first message", () => {
    expect(shouldBreakBefore(undefined, local(now, 0, 12, 0))).toBe(true);
  });

  it("breaks when the calendar day changes even within ten minutes", () => {
    expect(shouldBreakBefore(local(now, 1, 23, 58), local(now, 0, 0, 1))).toBe(true);
  });

  it("breaks once messages are ten minutes or more apart", () => {
    expect(shouldBreakBefore(local(now, 0, 12, 0), local(now, 0, 12, 9))).toBe(false);
    expect(shouldBreakBefore(local(now, 0, 12, 0), local(now, 0, 12, 10))).toBe(true);
  });

  it("does not break for a missing or invalid current timestamp", () => {
    expect(shouldBreakBefore(local(now, 0, 12, 0), undefined)).toBe(false);
    expect(shouldBreakBefore(local(now, 0, 12, 0), "nope")).toBe(false);
  });
});

function local(base: Date, daysAgo: number, hours: number, minutes: number) {
  const date = new Date(base);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}
