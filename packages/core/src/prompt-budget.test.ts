import { describe, expect, it } from "vitest";
import { type PromptSectionInput, planPrompt } from "./prompt-budget.js";

/** 1 token per char, so budgets in the tests read directly. */
const oneCharPerToken = (text: string) => text.length;

const section = (
  name: string,
  text: string,
  priority: number,
  required = false,
): PromptSectionInput => ({
  name,
  text,
  priority,
  required,
});

describe("planPrompt", () => {
  it("keeps everything when it fits and reports the totals", () => {
    const plan = planPrompt({
      contextWindow: 100,
      reserveForOutput: 20,
      estimateTokens: oneCharPerToken,
      sections: [
        section("system", "SYS".padEnd(10, "."), 100, true),
        section("task", "hi", 90, true),
      ],
    });
    expect(plan.overflowed).toBe(false);
    expect(plan.sections.map((s) => s.trimmed)).toEqual([false, false]);
    expect(plan.totalTokens).toBe(12);
    expect(plan.report).toContain("total 12");
  });

  it("preserves the caller's section order in the output", () => {
    const plan = planPrompt({
      contextWindow: 1000,
      reserveForOutput: 0,
      estimateTokens: oneCharPerToken,
      sections: [section("a", "aaa", 1), section("b", "bbb", 50), section("c", "ccc", 10)],
    });
    expect(plan.sections.map((s) => s.name)).toEqual(["a", "b", "c"]);
  });

  it("trims the lowest-priority flexible section to the remaining budget first", () => {
    const plan = planPrompt({
      contextWindow: 30,
      reserveForOutput: 0,
      estimateTokens: oneCharPerToken,
      sections: [
        section("task", "x".repeat(10), 100, true),
        section("memory", "m".repeat(30), 50),
        section("history", "h".repeat(30), 10),
      ],
    });
    // 20 left after task. memory (higher priority) is kept as far as it fits, history drops.
    expect(plan.sections.find((s) => s.name === "history")?.dropped).toBe(true);
    const memory = plan.sections.find((s) => s.name === "memory");
    expect(memory?.trimmed).toBe(true);
    expect(memory?.text).toMatch(/\[trimmed]$/);
    expect(plan.totalTokens).toBeLessThanOrEqual(30);
  });

  it("flags overflow but keeps required sections whole", () => {
    const plan = planPrompt({
      contextWindow: 10,
      reserveForOutput: 0,
      estimateTokens: oneCharPerToken,
      sections: [
        section("system", "s".repeat(8), 100, true),
        section("task", "t".repeat(8), 90, true),
        section("memory", "m".repeat(8), 10),
      ],
    });
    expect(plan.overflowed).toBe(true);
    expect(plan.sections.find((s) => s.name === "task")?.text).toHaveLength(8);
    expect(plan.sections.find((s) => s.name === "memory")?.dropped).toBe(true);
    expect(plan.report).toMatch(/OVERFLOW/);
  });

  it("uses a custom trim function when provided", () => {
    const plan = planPrompt({
      contextWindow: 15,
      reserveForOutput: 0,
      estimateTokens: oneCharPerToken,
      sections: [
        section("task", "t".repeat(5), 100, true),
        {
          name: "skills",
          text: "one\ntwo\nthree\nfour",
          priority: 20,
          trim: (text) => text.split("\n")[0] ?? "",
        },
      ],
    });
    expect(plan.sections.find((s) => s.name === "skills")?.text).toBe("one");
  });

  it("defaults to a chars/4 estimate", () => {
    const plan = planPrompt({
      contextWindow: 1000,
      reserveForOutput: 0,
      sections: [section("task", "12345678", 100, true)],
    });
    expect(plan.totalTokens).toBe(2);
  });
});
