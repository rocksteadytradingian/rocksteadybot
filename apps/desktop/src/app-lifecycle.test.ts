import { describe, expect, it } from "vitest";
import { shouldQuitWhenAllWindowsClosed } from "./app-lifecycle.js";

describe("shouldQuitWhenAllWindowsClosed", () => {
  it("never quits from the last window on macOS", () => {
    expect(shouldQuitWhenAllWindowsClosed("darwin", { launching: false, quitting: false })).toBe(
      false,
    );
    expect(shouldQuitWhenAllWindowsClosed("darwin", { launching: true, quitting: true })).toBe(
      false,
    );
  });

  it("does not quit on Windows while a hidden session probe is still closing", () => {
    expect(shouldQuitWhenAllWindowsClosed("win32", { launching: true, quitting: false })).toBe(
      false,
    );
    expect(shouldQuitWhenAllWindowsClosed("linux", { launching: true, quitting: false })).toBe(
      false,
    );
  });

  it("quits on Windows after launch when the user closes the last window", () => {
    expect(shouldQuitWhenAllWindowsClosed("win32", { launching: false, quitting: false })).toBe(
      true,
    );
  });
});
