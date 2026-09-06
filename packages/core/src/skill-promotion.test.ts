import { describe, expect, it } from "vitest";
import { parseSkillMd } from "./agent-skill.js";
import { detectRepeatedSequences, proposeSkillDraft } from "./skill-promotion.js";

describe("detectRepeatedSequences", () => {
  it("finds a sequence shared by two runs", () => {
    const runs = [
      { tools: ["open_url", "read_page", "fill_form", "click", "screenshot"] },
      { tools: ["note", "open_url", "read_page", "fill_form", "click", "done"] },
    ];
    const found = detectRepeatedSequences(runs, { minLength: 3 });
    expect(found[0]?.tools).toEqual(["open_url", "read_page", "fill_form", "click"]);
    expect(found[0]?.runs).toBe(2);
  });

  it("ignores a sequence that only appears in one run", () => {
    const runs = [{ tools: ["a", "b", "c", "d"] }, { tools: ["e", "f", "g", "h"] }];
    expect(detectRepeatedSequences(runs)).toEqual([]);
  });

  it("does not report a shorter sequence when a longer one covers the same runs", () => {
    const runs = [
      { tools: ["x", "login", "search", "export", "y"] },
      { tools: ["login", "search", "export"] },
      { tools: ["z", "login", "search", "export"] },
    ];
    const found = detectRepeatedSequences(runs, { minLength: 2, maxLength: 5 });
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({ tools: ["login", "search", "export"], runs: 3 });
  });

  it("respects minRuns", () => {
    const runs = [
      { tools: ["a", "b", "c"] },
      { tools: ["a", "b", "c"] },
      { tools: ["a", "b", "c"] },
    ];
    expect(detectRepeatedSequences(runs, { minRuns: 4 })).toEqual([]);
    expect(detectRepeatedSequences(runs, { minRuns: 3 })[0]?.runs).toBe(3);
  });
});

describe("proposeSkillDraft", () => {
  it("builds a valid SKILL.md listing the steps", () => {
    const md = proposeSkillDraft({
      tools: ["open_url", "read_page", "fill_form"],
      runs: 3,
      name: "File the weekly report",
    });
    const parsed = parseSkillMd(md);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.name).toBe("File the weekly report");
    expect(parsed.body).toContain("1. open_url");
    expect(parsed.body).toContain("3. fill_form");
  });

  it("falls back to a generic name and description", () => {
    const md = proposeSkillDraft({ tools: ["a", "b"] });
    const parsed = parseSkillMd(md);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.name).toBe("Repeated task");
  });
});
