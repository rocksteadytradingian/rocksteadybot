import { describe, expect, it } from "vitest";
import {
  browserWindowOptions,
  DEFAULT_WARM_WINDOW_TTL_MS,
  setupWindowOptions,
  warmWindowTtlMs,
} from "./window-options.js";

describe("desktop window chrome", () => {
  it("uses native traffic lights on macOS", () => {
    const opts = browserWindowOptions("darwin");
    expect(opts.frame).toBe(true);
    expect(opts.titleBarStyle).toBe("hiddenInset");
    expect(opts.trafficLightPosition).toEqual({ x: 16, y: 16 });
  });

  it("uses a hidden native frame on Windows so the window can move and resize", () => {
    const opts = browserWindowOptions("win32");
    expect(opts.frame).toBe(true);
    expect(opts.titleBarStyle).toBe("hidden");
    expect(opts.titleBarOverlay).toEqual({
      color: "#F4EFE6",
      symbolColor: "#2C2118",
      height: 36,
    });
    expect(opts.resizable).toBe(true);
    expect(opts.movable).toBe(true);
  });

  it("stays frameless on Linux so in-app buttons control the window", () => {
    const opts = browserWindowOptions("linux");
    expect(opts.frame).toBe(false);
    expect(opts.titleBarStyle).toBeUndefined();
    expect(opts.resizable).toBe(true);
    expect(opts.movable).toBe(true);
  });
});

describe("setup window chrome", () => {
  it("matches the app window chrome so first run looks like the product", () => {
    for (const platform of ["darwin", "win32", "linux"] as const) {
      const setup = setupWindowOptions(platform);
      const app = browserWindowOptions(platform);
      expect(setup.frame).toBe(app.frame);
      expect(setup.titleBarStyle).toBe(app.titleBarStyle);
      expect(setup.backgroundColor).toBe(app.backgroundColor);
    }
  });

  it("opens smaller than the app window and stays usable when resized down", () => {
    const setup = setupWindowOptions("win32");
    expect(setup.width).toBeLessThan(browserWindowOptions("win32").width);
    expect(setup.minWidth).toBeLessThanOrEqual(setup.width);
    expect(setup.minHeight).toBeLessThanOrEqual(setup.height);
  });
});

describe("warm window lifetime", () => {
  it("accepts finite timer delays within Node's supported range", () => {
    expect(warmWindowTtlMs("0")).toBe(0);
    expect(warmWindowTtlMs("900000")).toBe(900_000);
    expect(warmWindowTtlMs("2147483647")).toBe(2_147_483_647);
  });

  it.each([undefined, "", " ", "nope", "-1", "Infinity", "2147483648"])(
    "uses the default for an invalid value (%s)",
    (value) => {
      expect(warmWindowTtlMs(value)).toBe(DEFAULT_WARM_WINDOW_TTL_MS);
    },
  );
});
