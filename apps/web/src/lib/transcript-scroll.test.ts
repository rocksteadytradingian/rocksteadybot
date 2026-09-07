import { describe, expect, it } from "vitest";
import {
  scrollTranscriptToEnd,
  transcriptFollowAfterScroll,
  transcriptIsNearEnd,
} from "./transcript-scroll.js";

describe("transcriptIsNearEnd", () => {
  it("follows only while the viewport is within 80px of the latest message", () => {
    expect(transcriptIsNearEnd({ scrollHeight: 1_000, scrollTop: 421, clientHeight: 500 })).toBe(
      true,
    );
    expect(transcriptIsNearEnd({ scrollHeight: 1_000, scrollTop: 420, clientHeight: 500 })).toBe(
      false,
    );
  });
});

describe("scrollTranscriptToEnd", () => {
  it("pins the viewport to the latest content", () => {
    const element = { scrollTop: 10, scrollHeight: 800 };
    scrollTranscriptToEnd(element);
    expect(element.scrollTop).toBe(800);
  });
});

describe("transcriptFollowAfterScroll", () => {
  it("keeps following during a programmatic pin that has not reached the new end yet", () => {
    expect(transcriptFollowAfterScroll({ nearEnd: false, programmatic: true })).toBe(true);
  });

  it("drops follow once the user scrolls away from the latest message", () => {
    expect(transcriptFollowAfterScroll({ nearEnd: false, programmatic: false })).toBe(false);
  });

  it("resumes follow when the user scrolls back to the latest message", () => {
    expect(transcriptFollowAfterScroll({ nearEnd: true, programmatic: false })).toBe(true);
  });
});
