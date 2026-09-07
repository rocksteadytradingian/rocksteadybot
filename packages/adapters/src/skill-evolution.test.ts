import { describe, expect, it, vi } from "vitest";
import {
  buildSkillRevisionPrompt,
  parseSkillRevision,
  recordSkillOutcome,
} from "./skill-evolution.js";

const SKILL_MD = `---
name: Refund an order
description: Issue a refund and email the buyer
---

## Steps

1. Open the order
2. Click refund
`;

describe("buildSkillRevisionPrompt", () => {
  it("wraps the failure and transcript as untrusted data and keeps the name", () => {
    const prompt = buildSkillRevisionPrompt({
      skillName: "Refund an order",
      skillContent: SKILL_MD,
      failureSummary: "the refund button had moved",
      transcriptExcerpt: "assistant: clicked (120,400) — nothing happened",
    });
    expect(prompt).toContain("<failure>\nthe refund button had moved\n</failure>");
    expect(prompt).toContain("<transcript>");
    expect(prompt).toContain("Keep the same name");
    expect(prompt).toContain('{"reason"');
  });
});

describe("parseSkillRevision", () => {
  it("reads the JSON object the prompt asks for", () => {
    const reply = JSON.stringify({
      reason: "add a checkpoint before clicking refund",
      skill_md: SKILL_MD.replace("2. Click refund", "2. Wait for the Refund button, then click it"),
    });
    const parsed = parseSkillRevision(reply);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.reason).toBe("add a checkpoint before clicking refund");
    expect(parsed.content).toContain("Wait for the Refund button");
  });

  it("falls back to a fenced markdown block", () => {
    const parsed = parseSkillRevision("Here is the fix:\n\n```markdown\n" + SKILL_MD + "\n```\n");
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.content.startsWith("---")).toBe(true);
    expect(parsed.reason).toBe("Revised after a failed run.");
  });

  it("rejects a reply with no skill and an invalid revised document", () => {
    expect(parseSkillRevision("I could not work out what went wrong.")).toEqual({
      error: "No revised SKILL.md in the reply.",
    });
    const bad = parseSkillRevision(JSON.stringify({ skill_md: "no frontmatter here" }));
    expect("error" in bad).toBe(true);
  });
});

describe("recordSkillOutcome", () => {
  it("increments uses always and the outcome-specific counter", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = { agentSkill: { updateMany } } as never;
    const at = new Date("2026-09-07T12:00:00.000Z");

    await recordSkillOutcome(prisma, "sk-1", "verified", at);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "sk-1", source: "user" },
      data: {
        uses: { increment: 1 },
        successCount: { increment: 1 },
        failCount: { increment: 0 },
        lastUsedAt: at,
      },
    });

    await recordSkillOutcome(prisma, "sk-1", "contradicted", at);
    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          successCount: { increment: 0 },
          failCount: { increment: 1 },
        }),
      }),
    );
  });
});
