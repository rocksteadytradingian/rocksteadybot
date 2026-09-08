import { describe, expect, it } from "vitest";
import { browserSurfaceUnavailableNote, SKILL_SURFACES, skillSurface } from "./skill-surface.js";

describe("skillSurface", () => {
  it("passes through a known surface", () => {
    expect(skillSurface("computer")).toBe("computer");
    expect(skillSurface("browser")).toBe("browser");
  });

  it("defaults missing or unknown values to the bot computer", () => {
    expect(skillSurface(undefined)).toBe("computer");
    expect(skillSurface(null)).toBe("computer");
    expect(skillSurface("")).toBe("computer");
    expect(skillSurface("desktop")).toBe("computer");
  });

  it("lists both surfaces", () => {
    expect([...SKILL_SURFACES]).toEqual(["computer", "browser"]);
  });
});

describe("browserSurfaceUnavailableNote", () => {
  it("tells the model to fall back to the playbook", () => {
    expect(browserSurfaceUnavailableNote().toLowerCase()).toContain("playbook");
  });
});
