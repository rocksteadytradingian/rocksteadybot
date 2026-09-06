import { describe, expect, it, vi } from "vitest";
import { reviseSkill, type SkillReviseDeps } from "./skill-revise-job.js";

const SKILL_MD = `---
name: Refund an order
description: Issue a refund and email the buyer
---

## Steps

1. Open the order
2. Click refund
`;

const REVISED = SKILL_MD.replace("2. Click refund", "2. Wait for the Refund button, then click it");

function runtime(reply: string): SkillReviseDeps["runtime"] {
  return {
    describe: () => ({ capabilities: {} }) as never,
    abort: vi.fn(async () => undefined),
    run: async function* () {
      yield { type: "done", text: reply } as never;
    },
  } as never;
}

function deps(
  over: {
    skill?: Record<string, unknown> | null;
    run?: Record<string, unknown> | null;
    reply?: string;
    model?: { provider: string; id: string };
  } = {},
): SkillReviseDeps & { updateMany: ReturnType<typeof vi.fn> } {
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const skill =
    over.skill === undefined
      ? { id: "sk-1", name: "Refund an order", content: SKILL_MD, source: "user" }
      : over.skill;
  const run =
    over.run === undefined
      ? {
          id: "run-1",
          threadId: "th-1",
          botId: "bot-1",
          workspaceId: "ws-1",
          userId: "user-1",
          error: null,
        }
      : over.run;
  return {
    prisma: {
      agentSkill: { findUnique: vi.fn(async () => skill), updateMany },
      run: { findUnique: vi.fn(async () => run) },
      message: {
        findMany: vi.fn(async () => [
          { role: "assistant", blocks: [{ kind: "text", text: "clicked, nothing" }] },
        ]),
      },
      deploymentSettings: { findUnique: vi.fn(async () => null) },
    },
    runtime: runtime(over.reply ?? JSON.stringify({ reason: "add a wait", skill_md: REVISED })),
    resolveModel: vi.fn(async () => over.model ?? { provider: "anthropic", id: "claude" }),
    updateMany,
  } as unknown as SkillReviseDeps & { updateMany: ReturnType<typeof vi.fn> };
}

describe("reviseSkill", () => {
  it("parks a proposed revision on the skill row", async () => {
    const d = deps();
    const result = await reviseSkill(d, { skillId: "sk-1", runId: "run-1" });
    expect(result.status).toBe("proposed");
    expect(d.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sk-1", source: "user" },
        data: expect.objectContaining({
          pendingRevision: expect.objectContaining({ runId: "run-1", reason: "add a wait" }),
        }),
      }),
    );
  });

  it("skips a read-only skill without calling the model", async () => {
    const d = deps({ skill: { id: "sk-1", name: "x", content: SKILL_MD, source: "builtin" } });
    const result = await reviseSkill(d, { skillId: "sk-1", runId: "run-1" });
    expect(result).toEqual({ status: "skipped", reason: "read-only skill" });
    expect(d.updateMany).not.toHaveBeenCalled();
  });

  it("skips when no usable model is configured", async () => {
    const d = deps({ model: { provider: "scripted", id: "scripted" } });
    const result = await reviseSkill(d, { skillId: "sk-1", runId: "run-1" });
    expect(result).toEqual({ status: "skipped", reason: "no usable model" });
  });

  it("reports failure when the reply has no valid SKILL.md", async () => {
    const d = deps({ reply: "I am not sure what changed." });
    const result = await reviseSkill(d, { skillId: "sk-1", runId: "run-1" });
    expect(result.status).toBe("failed");
    expect(d.updateMany).not.toHaveBeenCalled();
  });

  it("skips when the run is gone", async () => {
    const d = deps({ run: null });
    expect(await reviseSkill(d, { skillId: "sk-1", runId: "run-1" })).toEqual({
      status: "skipped",
      reason: "run gone",
    });
  });
});
