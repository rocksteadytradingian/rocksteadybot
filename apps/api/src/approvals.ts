import type { Actor, PendingApproval } from "@rakazo/contracts";
import { collectPendingApprovals, mergeStallApproval, type WorkerStall } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";

const PENDING_LIMIT = 50;

export async function listPendingApprovals(
  prisma: PrismaClient,
  actor: Actor,
  inspectStall?: (workspaceId: string) => Promise<WorkerStall | null>,
): Promise<PendingApproval[]> {
  const effects = await prisma.externalEffect.findMany({
    where: {
      workspaceId: actor.workspaceId,
      status: "intended",
      run: {
        userId: actor.userId,
        status: "waiting_input",
        bot: { archivedAt: null },
      },
    },
    select: {
      id: true,
      kind: true,
      createdAt: true,
      run: {
        select: {
          id: true,
          threadId: true,
          botId: true,
          bot: { select: { name: true } },
          thread: {
            select: {
              groupId: true,
              group: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PENDING_LIMIT,
  });

  const items: PendingApproval[] =
    effects.length === 0
      ? []
      : collectPendingApprovals(
          effects.map((effect) => ({
            id: effect.id,
            kind: effect.kind,
            createdAt: effect.createdAt,
            run: {
              id: effect.run.id,
              threadId: effect.run.threadId,
              botId: effect.run.botId,
              botName: effect.run.bot.name,
              groupId: effect.run.thread.groupId,
              groupName: effect.run.thread.group?.name ?? null,
            },
          })),
          await prisma.message.findMany({
            where: {
              runId: { in: effects.map((effect) => effect.run.id) },
              role: "bot",
            },
            select: { id: true, runId: true, blocks: true },
          }),
        );

  const stall = inspectStall ? await inspectStall(actor.workspaceId).catch(() => null) : null;
  return mergeStallApproval(items, stall);
}
