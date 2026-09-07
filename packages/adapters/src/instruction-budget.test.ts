import { describe, expect, it } from "vitest";
import { assembleInstructions } from "./instruction-budget.js";

describe("assembleInstructions", () => {
  it("keeps every fragment, in order, when the budget is not pressed", () => {
    const result = assembleInstructions([
      { name: "bot", text: "You are a helpful bot." },
      { name: "memory", text: "The user prefers metric units.", priority: 60 },
      { name: "skills", text: "Available skills: refund, digest.", priority: 40 },
    ]);
    expect(result.trimmed).toBe(false);
    expect(result.text).toBe(
      "You are a helpful bot.\n\nThe user prefers metric units.\n\nAvailable skills: refund, digest.",
    );
  });

  it("skips empty and whitespace-only fragments", () => {
    const result = assembleInstructions([
      { name: "bot", text: "Core." },
      { name: "group", text: undefined },
      { name: "memory", text: "   ", priority: 60 },
    ]);
    expect(result.text).toBe("Core.");
  });

  it("drops the lowest-priority elastic fragment first when over budget, keeping fixed text", () => {
    const big = "x".repeat(4_000); // ~1000 tokens each at chars/4
    const result = assembleInstructions(
      [
        { name: "bot", text: "FIXED CORE GUIDANCE" },
        { name: "directory", text: big, priority: 10 },
        { name: "memory", text: big, priority: 60 },
      ],
      500, // budget in tokens — smaller than one elastic fragment
    );
    expect(result.text).toContain("FIXED CORE GUIDANCE");
    expect(result.trimmed).toBe(true);
    // memory (priority 60) survives in some trimmed form; the directory (10) is dropped first.
    expect(result.text).not.toContain(big);
    expect(result.report).toMatch(/directory: 0\/\d+ tok dropped/);
  });

  it("never trims a fixed fragment even if the required text alone overflows", () => {
    const huge = "y".repeat(40_000);
    const result = assembleInstructions(
      [
        { name: "bot", text: huge },
        { name: "memory", text: "keep me if you can", priority: 60 },
      ],
      100,
    );
    expect(result.text).toContain(huge);
    expect(result.report).toMatch(/OVERFLOW/);
  });
});
