import type { JobPublisher } from "@rakazo/adapter-kit";
import { sentinelJobKey, sentinelWakeupJob } from "@rakazo/adapter-kit";
import {
  SentinelActionSchema,
  SentinelCheckSchema,
  SentinelSpecSchema,
  SentinelTriggerSchema,
} from "@rakazo/contracts";
import { parseWindowMs } from "@rakazo/core";
import type { Prisma, PrismaClient, ThreadEvents } from "@rakazo/db";
import { resolveScheduleTiming } from "./schedule-tools.js";

export const SENTINEL_TOOL_NAMES = new Set(["sentinel_create", "sentinel_list", "sentinel_cancel"]);

export interface SentinelToolDeps {
  prisma: PrismaClient;
  events: ThreadEvents;
  jobs: JobPublisher;
}

interface SentinelToolContext {
  workspaceId: string;
  botId: string;
  userId: string;
  threadId: string;
}

/** Rows come back with `check`/`onFire`/`state` as `Prisma.JsonValue`; re-parse through the
 * contract so callers get the discriminated unions back. */
function shapeSentinel(row: {
  id: string;
  name: string;
  check: unknown;
  trigger: string;
  windowMs: number | null;
  onFire: unknown;
  active: boolean;
  state: unknown;
  lastCheckedAt: Date | null;
  nextRunAt: Date | null;
}) {
  return {
    sentinelId: row.id,
    name: row.name,
    check: SentinelCheckSchema.parse(row.check),
    trigger: SentinelTriggerSchema.parse(row.trigger),
    windowMs: row.windowMs,
    onFire: SentinelActionSchema.parse(row.onFire),
    active: row.active,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
  };
}

export async function createSentinelFromTool(
  deps: SentinelToolDeps,
  input: SentinelToolContext & {
    spec: unknown;
    /** How often to sample the check — same shape as schedule_create. */
    schedule: Record<string, unknown>;
    timezone?: string;
  },
) {
  const spec = SentinelSpecSchema.safeParse(input.spec);
  if (!spec.success) {
    return { error: spec.error.issues[0]?.message ?? "Invalid sentinel." };
  }
  // A wakeup runs without a computer or a bot turn, so only the checks and actions that
  // work in that context are accepted for now.
  if (spec.data.check.kind !== "http-ok") {
    return { error: 'Only "http-ok" sentinel checks are supported right now.' };
  }
  if (spec.data.onFire.kind !== "notify") {
    return { error: 'Sentinels can only "notify" right now, not start a run.' };
  }

  const timezone = String(input.timezone ?? "UTC");
  const resolved = resolveScheduleTiming(input.schedule, timezone);
  if (!resolved.ok) return { error: resolved.error };
  if (resolved.oneShot) {
    return { error: "A sentinel needs a repeating check, not a one-shot time." };
  }

  const windowMs = spec.data.window ? parseWindowMs(spec.data.window) : null;

  const row = await deps.prisma.sentinel.create({
    data: {
      workspaceId: input.workspaceId,
      botId: input.botId,
      userId: input.userId,
      name: spec.data.name,
      check: spec.data.check as unknown as Prisma.InputJsonValue,
      trigger: spec.data.trigger,
      windowMs,
      onFire: spec.data.onFire as unknown as Prisma.InputJsonValue,
      active: true,
      cron: resolved.cron,
      timezone,
      nextRunAt: resolved.nextRunAt,
    },
  });

  try {
    await deps.jobs.enqueue(sentinelWakeupJob(row.id, resolved.nextRunAt));
  } catch {
    try {
      await deps.prisma.sentinel.delete({ where: { id: row.id } });
    } catch {
      await deps.prisma.sentinel.update({
        where: { id: row.id },
        data: { active: false, nextRunAt: null },
      });
    }
    return { error: "Could not start the sentinel. Try again." };
  }

  try {
    await deps.events.append({
      workspaceId: input.workspaceId,
      threadId: input.threadId,
      botId: input.botId,
      type: "sentinel.created",
      payload: { name: row.name },
    });
  } catch {
    // The sentinel is live even if the thread signal fails.
  }

  return { ok: true as const, ...shapeSentinel(row) };
}

export async function listSentinelsFromTool(
  deps: Pick<SentinelToolDeps, "prisma">,
  input: { workspaceId: string; botId: string; userId: string },
) {
  const rows = await deps.prisma.sentinel.findMany({
    where: { workspaceId: input.workspaceId, botId: input.botId, userId: input.userId },
    orderBy: { createdAt: "desc" },
  });
  return { sentinels: rows.map(shapeSentinel) };
}

export async function cancelSentinelFromTool(
  deps: SentinelToolDeps,
  input: {
    workspaceId: string;
    botId: string;
    userId: string;
    sentinelId?: string;
    name?: string;
  },
) {
  const sentinelId = input.sentinelId?.trim();
  const name = input.name?.trim();
  if (!sentinelId && !name) {
    return { error: "Provide sentinelId or the exact sentinel name to cancel." };
  }

  const existing = await deps.prisma.sentinel.findFirst({
    where: {
      workspaceId: input.workspaceId,
      botId: input.botId,
      userId: input.userId,
      ...(sentinelId ? { id: sentinelId } : { name: name! }),
    },
  });
  if (!existing) return { error: "Sentinel not found." };

  await deps.prisma.sentinel.delete({ where: { id: existing.id } });
  await deps.jobs.cancel(sentinelJobKey(existing.id));
  return { ok: true as const, sentinelId: existing.id, name: existing.name };
}
