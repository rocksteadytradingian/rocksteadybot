import type { JobPublisher } from "@rakazo/adapter-kit";
import { sentinelWakeupJob } from "@rakazo/adapter-kit";
import { SentinelActionSchema, type SentinelCheck, SentinelCheckSchema } from "@rakazo/contracts";
import { nextCronDate, type SentinelObservation, type SentinelState } from "@rakazo/core";
import type { Prisma, PrismaClient, ThreadEvents } from "@rakazo/db";
import { runSentinelTick, type SentinelDefinition } from "./sentinel-runner.js";

/** Sample one check. Injected so the wake handler stays offline-testable — the real one
 * runs an http request or reads the active screen. */
export type SentinelCheckRunner = (check: SentinelCheck) => Promise<SentinelObservation>;

export interface SentinelWakeDeps {
  prisma: PrismaClient;
  jobs: JobPublisher;
  events: ThreadEvents;
  runCheck: SentinelCheckRunner;
  /** Start an agent run from a fired `run` action. */
  startRun: (input: {
    workspaceId: string;
    botId: string;
    userId: string;
    prompt: string;
  }) => Promise<void>;
  now?: () => Date;
}

/** One `sentinel.wakeup` job: sample the check, act on a transition, re-arm the next poll. */
export async function wakeSentinel(
  deps: SentinelWakeDeps,
  sentinelId: string,
  scheduledFor: string,
): Promise<{ fired: boolean; skipped?: string; error?: string }> {
  const scheduledAt = new Date(scheduledFor);
  if (!Number.isFinite(scheduledAt.getTime())) return { fired: false, skipped: "bad-schedule" };

  const row = await deps.prisma.sentinel.findUnique({ where: { id: sentinelId } });
  if (!row?.active) return { fired: false, skipped: "inactive" };
  // A stale wakeup (the row was re-armed to a later time) is dropped; the live job fires it.
  if (row.nextRunAt && row.nextRunAt.getTime() !== scheduledAt.getTime()) {
    return { fired: false, skipped: "superseded" };
  }

  const check = SentinelCheckSchema.parse(row.check);
  const onFire = SentinelActionSchema.parse(row.onFire);
  const previous = (row.state as SentinelState | null) ?? undefined;

  const definition: SentinelDefinition = {
    id: row.id,
    trigger: row.trigger as SentinelDefinition["trigger"],
    ...(row.windowMs != null ? { windowMs: row.windowMs } : {}),
    onFire:
      onFire.kind === "notify"
        ? { action: "notify", message: onFire.message }
        : { action: "run", prompt: onFire.prompt },
    ...(previous ? { state: previous } : {}),
  };

  const now = deps.now?.() ?? new Date();
  const nextPollAt = nextCronDate(
    row.cron,
    new Date(Math.max(now.getTime(), scheduledAt.getTime())),
    row.timezone,
  );
  // A stays-true-for that isn't ripe wants an extra check when its window elapses; take
  // whichever of that and the regular poll comes first.
  let followUpAt: Date | undefined;

  const result = await runSentinelTick(definition, {
    observe: () => deps.runCheck(check),
    persistState: async (state) => {
      await deps.prisma.sentinel.update({
        where: { id: row.id },
        data: { state: state as unknown as Prisma.InputJsonValue, lastCheckedAt: now },
      });
    },
    notify: async (message, observation) => {
      const bot = await deps.prisma.bot.findUnique({
        where: { id: row.botId },
        include: { thread: true },
      });
      if (!bot?.thread) return;
      await deps.events.append({
        workspaceId: row.workspaceId,
        threadId: bot.thread.id,
        botId: bot.id,
        type: "sentinel.fired",
        payload: { sentinelId: row.id, name: row.name, message, observed: observation.value },
      });
    },
    startRun: async (prompt) => {
      await deps.startRun({
        workspaceId: row.workspaceId,
        botId: row.botId,
        userId: row.userId,
        prompt,
      });
    },
    scheduleFollowUp: async (at) => {
      followUpAt = at;
    },
    now: () => now,
  });

  // Re-arm one wakeup even after a failed sample, so a transient check outage recovers
  // on the next tick: the regular poll, or the sooner stays-true-for follow-up.
  const wakeAt =
    followUpAt && followUpAt.getTime() < nextPollAt.getTime() ? followUpAt : nextPollAt;
  await deps.prisma.sentinel.update({ where: { id: row.id }, data: { nextRunAt: wakeAt } });
  try {
    await deps.jobs.enqueue(sentinelWakeupJob(row.id, wakeAt));
  } catch {
    // The reconciler re-arms from nextRunAt on the next sweep.
  }

  if (result.error) return { fired: false, error: result.error };
  return { fired: result.fired };
}
