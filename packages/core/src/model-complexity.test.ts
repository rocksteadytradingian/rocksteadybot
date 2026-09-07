import { COMPLEXITY_ROUTER_MODEL_ID } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  pickComplexityRouterSlot,
  resolveComplexityRouterModelId,
  routeModelComplexity,
} from "./model-complexity.js";

const slots = {
  fast: "qwen3:8b",
  smart: "qwen3:30b-a3b",
  heavy: "qwen3.8:27b",
};

describe("routeModelComplexity", () => {
  it("sends short chat and lookups to Fast", () => {
    expect(routeModelComplexity({ prompt: "thanks" })).toBe("fast");
    expect(routeModelComplexity({ prompt: "What time is it in Tokyo?" })).toBe("fast");
    expect(routeModelComplexity({ prompt: "ok" })).toBe("fast");
  });

  it("sends planning and coding to Smart", () => {
    expect(routeModelComplexity({ prompt: "Write a plan for the migration checklist." })).toBe(
      "smart",
    );
    expect(routeModelComplexity({ prompt: "Implement the login form next." })).toBe("smart");
    expect(routeModelComplexity({ prompt: "```ts\nconst x = 1;\n```" })).toBe("smart");
    expect(
      routeModelComplexity({
        prompt: "Please fix the handler and add a unit test for the timeout path.",
      }),
    ).toBe("smart");
  });

  it("sends vision, long prompts, and architecture work to Heavy", () => {
    expect(routeModelComplexity({ prompt: "What is this?", hasImages: true })).toBe("heavy");
    expect(routeModelComplexity({ prompt: "Design the architecture for a billing service." })).toBe(
      "heavy",
    );
    expect(routeModelComplexity({ prompt: "Build the compiler from scratch." })).toBe("heavy");
    expect(routeModelComplexity({ prompt: "x".repeat(2_000) })).toBe("heavy");
  });

  it("treats a very long thread as Smart even when the latest prompt is short", () => {
    expect(routeModelComplexity({ prompt: "continue", historyChars: 12_000 })).toBe("smart");
  });
});

describe("pickComplexityRouterSlot", () => {
  it("falls back down when a heavier slot is empty", () => {
    expect(pickComplexityRouterSlot("heavy", { fast: "a" })).toBe("a");
    expect(pickComplexityRouterSlot("heavy", { fast: "a", smart: "b" })).toBe("b");
    expect(pickComplexityRouterSlot("smart", { fast: "a" })).toBe("a");
    expect(pickComplexityRouterSlot("fast", slots)).toBe(slots.fast);
    expect(pickComplexityRouterSlot("smart", slots)).toBe(slots.smart);
    expect(pickComplexityRouterSlot("heavy", slots)).toBe(slots.heavy);
  });

  it("ignores Auto and blank slot values", () => {
    expect(
      pickComplexityRouterSlot("fast", { fast: COMPLEXITY_ROUTER_MODEL_ID, smart: "b" }),
    ).toBeUndefined();
    expect(pickComplexityRouterSlot("smart", { fast: "  ", smart: " b " })).toBe("b");
  });
});

describe("resolveComplexityRouterModelId", () => {
  it("leaves a pinned concrete model alone", () => {
    expect(
      resolveComplexityRouterModelId({
        candidateId: "qwen3:8b",
        slots,
        prompt: "Design the architecture for a billing service.",
      }),
    ).toBe("qwen3:8b");
  });

  it("routes Auto using the prompt, and keeps a sticky concrete id on resume", () => {
    expect(
      resolveComplexityRouterModelId({
        candidateId: COMPLEXITY_ROUTER_MODEL_ID,
        slots,
        prompt: "hi",
      }),
    ).toBe(slots.fast);
    expect(
      resolveComplexityRouterModelId({
        candidateId: COMPLEXITY_ROUTER_MODEL_ID,
        slots,
        prompt: "Implement the login form.",
      }),
    ).toBe(slots.smart);
    expect(
      resolveComplexityRouterModelId({
        candidateId: COMPLEXITY_ROUTER_MODEL_ID,
        slots,
        prompt: "hi",
        hasImages: true,
      }),
    ).toBe(slots.heavy);
    expect(
      resolveComplexityRouterModelId({
        candidateId: COMPLEXITY_ROUTER_MODEL_ID,
        slots,
        prompt: "hi",
        stickyModelId: slots.heavy,
      }),
    ).toBe(slots.heavy);
  });

  it("forces Fast for compaction", () => {
    expect(
      resolveComplexityRouterModelId({
        candidateId: COMPLEXITY_ROUTER_MODEL_ID,
        purpose: "compaction",
        slots,
        prompt: "Design the architecture for a billing service.",
        hasImages: true,
      }),
    ).toBe(slots.fast);
  });
});
