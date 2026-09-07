import { sentinelJobKey } from "@rakazo/adapter-kit";
import { toStoredSentinel } from "@rakazo/adapters";
import type { Actor, StoredSentinel } from "@rakazo/contracts";
import { IsolationError, type PrismaClient } from "@rakazo/db";

/** Read/cancel a bot's sentinels from the web — the same rows `sentinel_*` tools manage. */
export function createSentinelsService(
  prisma: PrismaClient,
  jobs: { cancel(key: string): Promise<void> },
) {
  return {
    async list(actor: Actor, input: { botId: string }): Promise<StoredSentinel[]> {
      const rows = await prisma.sentinel.findMany({
        where: {
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          botId: input.botId,
        },
        orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      });
      return rows.map(toStoredSentinel);
    },

    async cancel(actor: Actor, input: { sentinelId: string }): Promise<{ ok: true }> {
      const existing = await prisma.sentinel.findFirst({
        where: {
          id: input.sentinelId,
          workspaceId: actor.workspaceId,
          userId: actor.userId,
        },
        select: { id: true },
      });
      if (!existing) throw new IsolationError();
      await prisma.sentinel.delete({ where: { id: existing.id } });
      await jobs.cancel(sentinelJobKey(existing.id)).catch(() => undefined);
      return { ok: true };
    },
  };
}

export type SentinelsService = ReturnType<typeof createSentinelsService>;
