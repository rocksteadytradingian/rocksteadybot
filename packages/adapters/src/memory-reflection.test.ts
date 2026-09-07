import { describe, expect, it, vi } from "vitest";
import {
  buildReflectionPrompt,
  parseReflection,
  type ReflectedMemory,
  reflectOnRun,
} from "./memory-reflection.js";

describe("buildReflectionPrompt", () => {
  it("demands a guard memory when the run failed", () => {
    expect(buildReflectionPrompt({ transcript: "…", outcome: "failed" })).toMatch(
      /Include at least one "guard" memory/,
    );
    expect(buildReflectionPrompt({ transcript: "…", outcome: "succeeded" })).toMatch(
      /Only add a "guard" memory if/,
    );
  });
});

describe("parseReflection", () => {
  it("reads a JSON array and normalises each entry", () => {
    const reply = `Here is what I learned:
[
  { "scope": "user", "kind": "preference", "text": "The user wants reports as PDF, not CSV.", "evidence": "asked twice" },
  { "kind": "weird", "text": "The Q3 sheet id is 1AbC.", "extra": true }
]`;
    expect(parseReflection(reply)).toEqual<ReflectedMemory[]>([
      {
        scope: "user",
        kind: "preference",
        text: "The user wants reports as PDF, not CSV.",
        evidence: "asked twice",
      },
      { scope: "bot", kind: "fact", text: "The Q3 sheet id is 1AbC.", evidence: undefined },
    ]);
  });

  it("falls back to one JSON object per line", () => {
    const reply = `{"scope":"bot","kind":"fact","text":"Login lives at /auth."}
not json
{"scope":"bot","kind":"guard","text":"Do not click Export before the table loads."}`;
    expect(parseReflection(reply).map((m) => m.kind)).toEqual(["fact", "guard"]);
  });

  it("dedupes by text and caps the count", () => {
    const items = Array.from({ length: 10 }, (_, i) => `{"text":"fact ${i % 3}"}`).join("\n");
    const out = parseReflection(items, { max: 4 });
    expect(out).toHaveLength(3); // only 3 distinct
  });

  it("drops entries with no usable text", () => {
    expect(parseReflection('[{"text":"ok fact"},{"text":"x"},{"scope":"user"}]')).toHaveLength(1);
  });
});

describe("reflectOnRun", () => {
  it("asks, parses, and saves each memory", async () => {
    const ask = vi.fn().mockResolvedValue('[{"text":"The export button is top-right."}]');
    const save = vi.fn().mockResolvedValue(undefined);
    const result = await reflectOnRun({
      input: { transcript: "did a thing", outcome: "succeeded" },
      ask,
      save,
    });
    expect(ask).toHaveBeenCalledOnce();
    expect(result).toEqual({
      memories: [
        {
          scope: "bot",
          kind: "fact",
          text: "The export button is top-right.",
          evidence: undefined,
        },
      ],
      saved: 1,
    });
  });

  it("returns empty on a blank transcript without calling the model", async () => {
    const ask = vi.fn();
    const result = await reflectOnRun({
      input: { transcript: "  ", outcome: "unknown" },
      ask,
      save: vi.fn(),
    });
    expect(ask).not.toHaveBeenCalled();
    expect(result).toEqual({ memories: [], saved: 0 });
  });

  it("swallows a model error", async () => {
    const result = await reflectOnRun({
      input: { transcript: "x", outcome: "failed" },
      ask: vi.fn().mockRejectedValue(new Error("model down")),
      save: vi.fn(),
    });
    expect(result).toEqual({ memories: [], saved: 0 });
  });

  it("keeps going when one save fails", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("db")).mockResolvedValue(undefined);
    const result = await reflectOnRun({
      input: { transcript: "x", outcome: "succeeded" },
      ask: vi.fn().mockResolvedValue('[{"text":"one"},{"text":"two"}]'),
      save,
    });
    expect(result.saved).toBe(1);
    expect(result.memories).toHaveLength(2);
  });
});
