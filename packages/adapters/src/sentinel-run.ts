import type { JobPublisher } from "@rakazo/adapter-kit";
import { runContinueJob } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";

/**
 * Start a run for a bot from a fired `run`-action sentinel. Mirrors `executor.wakeRoutine`'s
 * task+run creation: one transaction, then enqueue the continuation, rolling the rows back if
 * the queue is unreachable so a wakeup retry can try again.
 */
export interface SentinelRunDeps {
  prisma: PrismaClient;
  jobs: JobPublisher;
}

export async function startSentinelRun(
  deps: SentinelRunDeps,
  input: { workspaceId: string; botId: string; userId: string; prompt: string },
): Promise<{ started: boolean; runId?: string }> {
  const bot = await deps.prisma.bot.findUnique({
    where: { id: input.botId },
    include: { thread: true },
  });
  if (!bot?.thread) return { started: false };
  const threadId = bot.thread.id;

  const claimed = await deps.prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        workspaceId: input.workspaceId,
        botId: input.botId,
        threadId,
        userId: input.userId,
        prompt: input.prompt,
        status: "queued",
      },
    });
    return tx.run.create({
      data: {
        workspaceId: input.workspaceId,
        botId: input.botId,
        threadId,
        taskId: task.id,
        userId: input.userId,
        status: "queued",
        trigger: "sentinel",
      },
    });
  });

  try {
    await deps.jobs.enqueue(runContinueJob(claimed.id));
  } catch (error) {
    await deps.prisma.$transaction(async (tx) => {
      await tx.run.deleteMany({ where: { id: claimed.id, status: "queued" } });
      await tx.task.deleteMany({ where: { id: claimed.taskId, status: "queued" } });
    });
    throw error;
  }

  return { started: true, runId: claimed.id };
}
