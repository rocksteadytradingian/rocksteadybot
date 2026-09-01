import { describe, expect, it } from "vitest";
import { isTranscriptNearBottom, scrollTranscriptToBottom } from "./transcript-scroll";

describe("isTranscriptNearBottom", () => {
  it("is true at the bottom and within the stick threshold", () => {
    expect(
      isTranscriptNearBottom({ scrollTop: 840, scrollHeight: 1000, clientHeight: 160 }, 160),
    ).toBe(true);
    expect(
      isTranscriptNearBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 }, 80),
    ).toBe(true);
  });

  it("is false after the user scrolls up", () => {
    expect(
      isTranscriptNearBottom({ scrollTop: 200, scrollHeight: 2000, clientHeight: 400 }, 160),
    ).toBe(false);
  });
});

describe("scrollTranscriptToBottom", () => {
  it("pins the viewport to the latest content", () => {
    const element = { scrollTop: 10, scrollHeight: 800 };
    scrollTranscriptToBottom(element);
    expect(element.scrollTop).toBe(800);
  });
});
