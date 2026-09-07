import { describe, expect, it } from "vitest";
import { compactToolResultForModel, MAX_TOOL_RESULT_CHARS } from "./tool-result-compact.js";

function logLines(count: number, kind: "info" | "error", prefix = ""): string {
  return Array.from({ length: count }, (_, index) =>
    kind === "info"
      ? `${prefix}INFO step ${index} still running`
      : `${prefix}ERROR boom at ${index}`,
  ).join("\n");
}

describe("compactToolResultForModel", () => {
  it("leaves small results unchanged", () => {
    const result = { ok: true, path: "notes/plan.md" };
    expect(compactToolResultForModel(result)).toBe(JSON.stringify(result));
  });

  it("keeps the error at the end of a noisy shell log that would exceed a blunt head slice", () => {
    const stdout = [
      logLines(400, "info"),
      'npm ERR! Missing script: "build"',
      "Error: command failed with exit code 1",
    ].join("\n");
    const text = compactToolResultForModel({ stdout, stderr: "", code: 1 });

    expect(text.length).toBeLessThan(JSON.stringify({ stdout, stderr: "", code: 1 }).length);
    expect(text).toContain("npm ERR! Missing script");
    expect(text).toContain("command failed with exit code 1");
    expect(text).toContain("compacted log");
    expect(text).toMatch(/omitted/i);
  });

  it("drops INFO/progress noise while keeping a stack trace in the middle", () => {
    const stdout = [
      logLines(30, "info"),
      "ERROR cannot connect",
      "    at connect (db.ts:12:5)",
      "    at main (index.ts:4:1)",
      logLines(80, "info"),
    ].join("\n");
    const text = compactToolResultForModel({ stdout, stderr: "", code: 1 });

    expect(text).toContain("ERROR cannot connect");
    expect(text).toContain("at connect (db.ts:12:5)");
    expect(text).not.toContain("INFO step 25 still running");
  });

  it("collapses long repetitive JSON arrays and preserves error items", () => {
    const items: Array<{ id: number; name: string; error?: string }> = Array.from(
      { length: 40 },
      (_, index) => ({ id: index, name: `row-${index}` }),
    );
    items[17] = { id: 17, name: "row-17", error: "duplicate key" };
    const text = compactToolResultForModel({ items });
    const parsed = JSON.parse(text) as { items: Array<Record<string, unknown>> };

    expect(parsed.items.length).toBeLessThan(items.length);
    expect(parsed.items.some((item) => item.error === "duplicate key")).toBe(true);
    expect(parsed.items.some((item) => item._omitted === 13 || Number(item._omitted) > 0)).toBe(
      true,
    );
  });

  it("is fail-closed: never returns a larger payload than JSON.stringify", () => {
    const result = { a: 1, b: "short" };
    const text = compactToolResultForModel(result);
    expect(text.length).toBeLessThanOrEqual(JSON.stringify(result).length);
  });

  it("caps huge non-log text with a head and tail instead of dropping the end", () => {
    const content = `START-${"x".repeat(20_000)}-NEEDLE-END`;
    const text = compactToolResultForModel({ path: "out.txt", content });
    expect(text.length).toBeLessThanOrEqual(MAX_TOOL_RESULT_CHARS);
    expect(text).toContain("START-");
    expect(text).toContain("NEEDLE-END");
  });
});
