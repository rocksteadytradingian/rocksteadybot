import type { Actor } from "@rakazo/contracts";
import { IsolationError } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createAgentSkillsService } from "./agent-skills.js";

const actor = { workspaceId: "ws-1", userId: "user-1" } as Actor;

const SKILL_MD = `---
name: Refund an order
description: Issue a refund and email the buyer
---

## Steps

1. Open the order
2. Click refund
`;
const REVISED = SKILL_MD.replace("2. Click refund", "2. Wait for the Refund button, then click it");

function row(over: Record<string, unknown> = {}) {
  return {
    id: "sk-1",
    name: "Refund an order",
    description: "Issue a refund and email the buyer",
    content: SKILL_MD,
    source: "user",
    uses: 3,
    successCount: 1,
    failCount: 2,
    lastUsedAt: new Date("2026-09-07T12:00:00.000Z"),
    pendingRevision: {
      content: REVISED,
      reason: "add a wait before clicking",
      runId: "run-9",
      createdAt: "2026-09-07T12:00:00.000Z",
    },
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-07T12:00:00.000Z"),
    ...over,
  };
}

function prisma(over: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return {
    agentSkill: {
      findMany: vi.fn(async () => [row()]),
      findFirst: vi.fn(async () => row()),
      updateMany: vi.fn(async () => ({ count: 1 })),
      ...over,
    },
  } as never;
}

describe("agentSkills revisions", () => {
  it("lists only user skills that carry a pending revision", async () => {
    const p = prisma();
    const svc = createAgentSkillsService(p);
    const list = await svc.revisions(actor);
    expect(list).toHaveLength(1);
    expect(list[0]?.pendingRevision?.reason).toBe("add a wait before clicking");
    expect(
      (p as never as { agentSkill: { findMany: ReturnType<typeof vi.fn> } }).agentSkill.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: "user" }),
      }),
    );
  });

  it("applies a revision: writes the revised content and clears the column", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ content: REVISED, pendingRevision: null }));
    const svc = createAgentSkillsService(prisma({ updateMany, findFirst }));
    const result = await svc.applyRevision(actor, { skillId: "sk-1" });
    expect(result.content).toContain("Wait for the Refund button");
    expect(result.pendingRevision).toBeNull();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: expect.stringContaining("Wait for the Refund") }),
      }),
    );
  });

  it("rejects apply when there is no pending revision", async () => {
    const svc = createAgentSkillsService(
      prisma({ findFirst: vi.fn(async () => row({ pendingRevision: null })) }),
    );
    await expect(svc.applyRevision(actor, { skillId: "sk-1" })).rejects.toThrow(
      /no pending revision/i,
    );
  });

  it("dismiss clears the column without touching content", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(row({ pendingRevision: null }));
    const svc = createAgentSkillsService(prisma({ updateMany, findFirst }));
    const result = await svc.dismissRevision(actor, { skillId: "sk-1" });
    expect(result.pendingRevision).toBeNull();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ content: expect.anything() }),
      }),
    );
  });

  it("is owner-scoped — a missing row is an isolation error", async () => {
    const svc = createAgentSkillsService(prisma({ findFirst: vi.fn(async () => null) }));
    await expect(svc.applyRevision(actor, { skillId: "sk-x" })).rejects.toBeInstanceOf(
      IsolationError,
    );
  });
});
