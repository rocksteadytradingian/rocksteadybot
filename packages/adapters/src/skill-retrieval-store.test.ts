import { describe, expect, it, vi } from "vitest";
import { retrieveSkillsForTask } from "./skill-retrieval-store.js";

type PrismaArg = Parameters<typeof retrieveSkillsForTask>[0];

function prisma(
  rows: unknown[],
): PrismaArg & { agentSkill: { findMany: ReturnType<typeof vi.fn> } } {
  return { agentSkill: { findMany: vi.fn(async () => rows) } } as never;
}

const owner = { workspaceId: "ws-1", userId: "user-1" };

const stripeRefund = {
  id: "sk-1",
  name: "Refund a Stripe charge",
  description: "Issue a refund and email the buyer",
  source: "user",
  uses: 4,
  successCount: 4,
  failCount: 0,
  lastUsedAt: new Date("2026-09-01T00:00:00.000Z"),
};
const salesDigest = {
  id: "sk-2",
  name: "Weekly sales digest",
  description: "Summarise revenue and post to Slack",
  source: "user",
  uses: 0,
  successCount: 0,
  failCount: 0,
  lastUsedAt: null,
};

describe("retrieveSkillsForTask", () => {
  it("returns the skill whose name matches the task", async () => {
    const ranked = await retrieveSkillsForTask(prisma([stripeRefund, salesDigest]), owner, {
      query: "refund this Stripe charge for the customer",
    });
    expect(ranked[0]?.skill.name).toBe("Refund a Stripe charge");
    expect(ranked[0]?.skill.stats.successCount).toBe(4);
  });

  it("returns nothing for an empty query", async () => {
    const ranked = await retrieveSkillsForTask(prisma([stripeRefund]), owner, { query: "" });
    expect(ranked).toEqual([]);
  });

  it("honours the limit", async () => {
    const ranked = await retrieveSkillsForTask(prisma([stripeRefund, salesDigest]), owner, {
      query: "refund sales revenue stripe slack digest",
      limit: 1,
    });
    expect(ranked).toHaveLength(1);
  });

  it("scopes the query to the owner", async () => {
    const p = prisma([]);
    await retrieveSkillsForTask(p, owner, { query: "anything" });
    expect(p.agentSkill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: "ws-1", userId: "user-1" } }),
    );
  });
});
