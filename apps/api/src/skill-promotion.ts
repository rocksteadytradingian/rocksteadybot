import { createHash } from "node:crypto";
import type { Actor, SkillPromotionSuggestion } from "@rakazo/contracts";
import { detectRepeatedSequences, proposeSkillDraft } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";

const RECENT_RUNS = 20;
const MIN_SEQUENCE_LENGTH = 3;
const MIN_RUNS = 2;
const MAX_SUGGESTIONS = 3;

/**
 * Offer to save a recurring chunk of work as a skill. Scans a bot's recent completed runs for
 * a contiguous tool-call sequence that keeps coming back and drafts a SKILL.md from it. Pure
 * read + compute — dismissing a suggestion is the client's job (keyed by `hash`).
 */
export function createSkillPromotionService(prisma: PrismaClient) {
  return {
    async suggestions(actor: Actor, input: { botId: string }): Promise<SkillPromotionSuggestion[]> {
      const runs = await prisma.run.findMany({
        where: {
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          botId: input.botId,
          status: "completed",
        },
        orderBy: { completedAt: "desc" },
        take: RECENT_RUNS,
        select: { id: true },
      });
      if (runs.length < MIN_RUNS) return [];

      const events = await prisma.event.findMany({
        where: { runId: { in: runs.map((run) => run.id) }, type: "agent.tool.called" },
        orderBy: { seq: "asc" },
        select: { runId: true, payload: true },
      });

      const byRun = new Map<string, string[]>();
      for (const event of events) {
        if (!event.runId) continue;
        const name = (event.payload as { name?: unknown }).name;
        if (typeof name !== "string") continue;
        const list = byRun.get(event.runId) ?? [];
        // Collapse an immediate repeat (three observes in a row is not a pattern).
        if (list[list.length - 1] !== name) list.push(name);
        byRun.set(event.runId, list);
      }

      const detected = detectRepeatedSequences(
        [...byRun.values()].map((tools) => ({ tools })),
        { minLength: MIN_SEQUENCE_LENGTH, minRuns: MIN_RUNS, limit: MAX_SUGGESTIONS },
      );

      return detected.map((sequence) => ({
        hash: createHash("sha256").update(sequence.tools.join(" ")).digest("hex").slice(0, 16),
        tools: sequence.tools,
        runCount: sequence.runs,
        draft: proposeSkillDraft({ tools: sequence.tools, runs: sequence.runs }),
      }));
    },
  };
}

export type SkillPromotionService = ReturnType<typeof createSkillPromotionService>;
