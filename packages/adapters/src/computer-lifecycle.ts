import { mkdir } from "node:fs/promises";
import type {
  AdapterContext,
  AgentHomeStore,
  ComputerRef,
  JobPublisher,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import { ACTIVE_RUN_STATUSES, screenLeaseId } from "@rakazo/core";
import { type PrismaClient, parseComputerMode, type ThreadEvents } from "@rakazo/db";
import { expireComputerControl, hasActiveComputerControl } from "./computer-control.js";
import { toComputerRef } from "./computer-support.js";
import {
  checkpointAndRecordComputerWorkspace,
  ensureComputerWorkspaceLayout,
  restoreComputerWorkspace,
} from "./computer-workspace.js";
import { isUnrecoverableSandboxError } from "./e2b-sandbox.js";
import { resolveAgentHomePath } from "./home.js";

const EXECUTION_LEASE_MS = 5 * 60_000;
const BOOT_WAIT_ATTEMPTS = 40;
const BOOT_WAIT_MS = 250;

export class ComputerBusyError extends Error {
  constructor() {
    super("Computer is busy");
    this.name = "ComputerBusyError";
  }
}

export { toComputerRef } from "./computer-support.js";

type ProvisionDeps = {
  prisma: PrismaClient;
  sandbox: SandboxProvider;
  home: AgentHomeStore;
  jobs: JobPublisher;
  events: ThreadEvents;
  dataDir?: string;
};

/**
 * Boot the workspace team computer as a shared surface for a grouped bot. Unlike
 * `provisionComputer`, this does not require `context.botId` to be an assigned bot
 * of the computer — a group whose members all run on their own computers leaves the
 * team computer with no `bots` rows.
 */
export function provisionSharedComputer(
  deps: ProvisionDeps,
  computerId: string,
  context: AdapterContext,
): Promise<ComputerRef> {
  return provisionComputer(deps, computerId, context, "none", { requireBotMembership: false });
}

export async function provisionComputer(
  deps: ProvisionDeps,
  computerId: string,
  context: AdapterContext,
  controlHolder: "bot" | "none" = "none",
  options: { requireBotMembership?: boolean } = {},
): Promise<ComputerRef> {
  let existing = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
  if (existing.controlLeaseId && !hasActiveComputerControl(existing)) {
    await expireComputerControl(deps, existing.id, existing.controlLeaseId);
    existing = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
    if (existing.controlLeaseId && !hasActiveComputerControl(existing)) {
      throw new Error("computer control revocation is still in progress");
    }
  }
  const homePath = resolveAgentHomePath(deps.home, existing.homeKey, deps.dataDir ?? "./data");
  await mkdir(homePath, { recursive: true });

  if (existing.state === "running" && existing.providerRef) {
    return reconnectComputer(deps, existing, homePath, context);
  }
  if (existing.state === "booting" || existing.state === "suspending") {
    const ready = await waitForComputerReady(deps.prisma, computerId, context);
    if (ready?.state === "running" && ready.providerRef) {
      return reconnectComputer(deps, ready, homePath, context);
    }
    existing = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
  }

  const requireBotMembership = options.requireBotMembership ?? true;
  const claimed = await deps.prisma.computer.updateMany({
    where: {
      id: computerId,
      state: { in: ["stopped", "suspended", "error"] },
      ...(requireBotMembership && context.botId
        ? { bots: { some: { id: context.botId, archivedAt: null } } }
        : {}),
    },
    data: { state: "booting" },
  });
  if (claimed.count !== 1) throw new ComputerBusyError();
  let provisioned: ComputerRef | undefined;
  try {
    const ref = await deps.sandbox.provision(
      {
        botId: existing.homeKey,
        homePath,
        providerRef: existing.providerRef ?? undefined,
        providerKind: existing.kind as ComputerRef["kind"],
      },
      context,
    );
    provisioned = ref;
    await deps.sandbox.prepare(ref, context);
    const replacement =
      ref.fresh === true ||
      !existing.providerRef ||
      existing.providerRef !== ref.providerRef ||
      existing.kind !== ref.kind;
    if (replacement) {
      await restoreComputerWorkspace(deps.home, deps.sandbox, existing.homeKey, ref, context);
    }
    await ensureComputerWorkspaceLayout(
      deps.sandbox,
      ref,
      parseComputerMode(existing.scope),
      context.botId,
      context,
    );
    const activeControl = hasActiveComputerControl(existing);
    const activated = await deps.prisma.computer.updateMany({
      where: {
        id: computerId,
        state: "booting",
        ...(context.botId ? { bots: { some: { id: context.botId, archivedAt: null } } } : {}),
      },
      data: {
        state: "running",
        providerRef: ref.providerRef,
        kind: ref.kind,
        controlHolder: activeControl ? "user" : controlHolder,
        ...(!activeControl
          ? {
              controlLeaseId: null,
              controlLeaseExpiresAt: null,
              controlBotId: null,
              controlRunId: null,
            }
          : {}),
      },
    });
    if (activated.count !== 1) {
      throw new ComputerBusyError();
    }
    return ref;
  } catch (error) {
    const rollbackError = provisioned
      ? await rollbackProvisionedComputer(deps.sandbox, provisioned, context, error)
      : undefined;
    try {
      await deps.prisma.computer.updateMany({
        where: { id: computerId, state: "booting" },
        data: {
          state: "error",
          ...(rollbackError && provisioned
            ? { providerRef: provisioned.providerRef, kind: provisioned.kind }
            : {}),
        },
      });
    } catch (recordError) {
      throw new AggregateError(
        [error, ...(rollbackError ? [rollbackError] : []), recordError],
        "Computer provisioning failed and its failure could not be recorded",
      );
    }
    if (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Computer provisioning failed and its sandbox could not be rolled back",
      );
    }
    throw error;
  }
}

async function reconnectComputer(
  deps: {
    prisma: PrismaClient;
    sandbox: SandboxProvider;
    home: AgentHomeStore;
    dataDir?: string;
  },
  computer: {
    id: string;
    homeKey: string;
    providerRef: string | null;
    kind: string;
    scope: string;
  },
  homePath: string,
  context: AdapterContext,
): Promise<ComputerRef> {
  const ref = await deps.sandbox.provision(
    {
      botId: computer.homeKey,
      homePath,
      providerRef: computer.providerRef ?? undefined,
      providerKind: computer.kind as ComputerRef["kind"],
    },
    context,
  );
  await deps.sandbox.prepare(ref, context);
  if (ref.providerRef !== computer.providerRef || ref.kind !== computer.kind) {
    await deps.prisma.computer.updateMany({
      where: { id: computer.id, state: "running" },
      data: { providerRef: ref.providerRef, kind: ref.kind },
    });
  }
  await ensureComputerWorkspaceLayout(
    deps.sandbox,
    ref,
    parseComputerMode(computer.scope),
    context.botId,
    context,
  );
  return ref;
}

async function waitForComputerReady(
  prisma: PrismaClient,
  computerId: string,
  context: AdapterContext,
) {
  for (let attempt = 0; attempt < BOOT_WAIT_ATTEMPTS; attempt += 1) {
    const current = await prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
    if (current.state === "running" && current.providerRef) return current;
    if (current.state !== "booting" && current.state !== "suspending") return current;
    await new Promise((resolve) => setTimeout(resolve, BOOT_WAIT_MS));
    if (context.signal.aborted) {
      throw context.signal.reason ?? new Error("computer boot aborted");
    }
  }
  return prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
}

async function rollbackProvisionedComputer(
  sandbox: SandboxProvider,
  computer: ComputerRef,
  context: AdapterContext,
  cause: unknown,
): Promise<unknown | undefined> {
  try {
    await sandbox.releaseScreen?.(computer, context).catch(() => undefined);
    if (computer.fresh) {
      await sandbox.destroy(computer, context);
    } else if (cause instanceof ComputerBusyError) {
      try {
        await sandbox.stop(computer, context);
      } catch {
        await sandbox.destroy(computer, context);
      }
    } else {
      await sandbox.stop(computer, context);
    }
    return undefined;
  } catch (error) {
    return error;
  }
}

export interface ComputerExecutionLease {
  computerId: string;
  botId: string;
  runId: string;
  fence: number;
}

export function screenLeaseIdForRun(
  lease: Pick<ComputerExecutionLease, "runId" | "fence"> | null,
  runId: string,
  fence = 0,
): string {
  return screenLeaseId(lease?.runId ?? runId, lease?.fence ?? fence);
}

export async function acquireComputerExecutionLease(
  prisma: PrismaClient,
  input: {
    computerId: string;
    runId: string;
    botId: string;
    resumeHeldLease?: boolean;
  },
): Promise<ComputerExecutionLease | null> {
  const computer = await prisma.computer.findUniqueOrThrow({ where: { id: input.computerId } });
  if (computer.state === "suspending") throw new ComputerBusyError();
  const dedicated = computer.scope !== "team";
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EXECUTION_LEASE_MS);
  const [reclaimed] = await prisma.computerExecutionLease.updateManyAndReturn({
    where: dedicated
      ? { computerId: input.computerId, botId: input.botId }
      : {
          computerId: input.computerId,
          botId: input.botId,
          OR: [
            { expiresAt: { lt: now } },
            ...(input.resumeHeldLease ? [{ runId: input.runId }] : []),
          ],
        },
    data: {
      runId: input.runId,
      expiresAt,
      fence: { increment: 1 },
    },
    select: { fence: true },
  });
  if (reclaimed) {
    return validateAcquiredComputerLease(prisma, {
      computerId: input.computerId,
      botId: input.botId,
      runId: input.runId,
      fence: reclaimed.fence,
    });
  }
  try {
    const created = await prisma.computerExecutionLease.create({
      data: {
        computerId: input.computerId,
        botId: input.botId,
        runId: input.runId,
        fence: 1,
        expiresAt,
      },
      select: { fence: true },
    });
    return validateAcquiredComputerLease(prisma, {
      computerId: input.computerId,
      botId: input.botId,
      runId: input.runId,
      fence: created.fence,
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    if (!dedicated) throw new ComputerBusyError();
    const [stolen] = await prisma.computerExecutionLease.updateManyAndReturn({
      where: { computerId: input.computerId, botId: input.botId },
      data: {
        runId: input.runId,
        expiresAt,
        fence: { increment: 1 },
      },
      select: { fence: true },
    });
    if (!stolen) throw new ComputerBusyError();
    return validateAcquiredComputerLease(prisma, {
      computerId: input.computerId,
      botId: input.botId,
      runId: input.runId,
      fence: stolen.fence,
    });
  }
}

async function validateAcquiredComputerLease(
  prisma: PrismaClient,
  lease: ComputerExecutionLease,
): Promise<ComputerExecutionLease> {
  const computer = await prisma.computer.findUniqueOrThrow({
    where: { id: lease.computerId },
    select: { state: true },
  });
  if (computer.state !== "suspending") return lease;
  await releaseComputerExecutionLease(prisma, lease);
  throw new ComputerBusyError();
}

export async function renewComputerExecutionLease(
  prisma: PrismaClient,
  lease: ComputerExecutionLease | null,
): Promise<boolean> {
  if (!lease) return true;
  const renewed = await prisma.computerExecutionLease.updateMany({
    where: {
      computerId: lease.computerId,
      botId: lease.botId,
      runId: lease.runId,
      fence: lease.fence,
    },
    data: { expiresAt: new Date(Date.now() + EXECUTION_LEASE_MS) },
  });
  return renewed.count === 1;
}

export async function holdComputerExecutionLeaseForTakeover(
  prisma: PrismaClient,
  lease: ComputerExecutionLease | null,
): Promise<boolean> {
  if (!lease) return true;
  const held = await prisma.computerExecutionLease.updateMany({
    where: {
      computerId: lease.computerId,
      botId: lease.botId,
      runId: lease.runId,
      fence: lease.fence,
    },
    data: { expiresAt: new Date(Date.now() + 24 * 60 * 60_000) },
  });
  return held.count === 1;
}

export async function releaseComputerExecutionLease(
  prisma: PrismaClient,
  lease: ComputerExecutionLease | null,
): Promise<void> {
  if (!lease) return;
  // Expire instead of deleting so the next acquire increments the same fence.
  // Deleting the row reset the fence to 1, which cannot take a leftover
  // supervisor assignment from a previous run with a higher fence.
  await prisma.computerExecutionLease.updateMany({
    where: {
      computerId: lease.computerId,
      botId: lease.botId,
      runId: lease.runId,
      fence: lease.fence,
    },
    data: { expiresAt: new Date(0) },
  });
}

export async function releaseBotComputerSession(
  deps: {
    prisma: PrismaClient;
    sandbox: SandboxProvider;
  },
  computer: {
    id: string;
    homeKey: string;
    kind: string;
    providerRef: string | null;
  },
  context: AdapterContext,
): Promise<void> {
  const botId = context.botId;
  if (!botId) return;
  const lease = await deps.prisma.computerExecutionLease.findUnique({
    where: { computerId_botId: { computerId: computer.id, botId } },
    select: { runId: true, fence: true },
  });
  if (computer.providerRef) {
    await deps.sandbox
      .releaseScreen?.(toComputerRef(computer), {
        ...context,
        screenLeaseId: lease ? screenLeaseIdForRun(lease, lease.runId) : context.screenLeaseId,
      })
      .catch(() => undefined);
  }
  await deps.prisma.computerExecutionLease.deleteMany({
    where: { computerId: computer.id, botId },
  });
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export type ComputerReplaceMode = "recover" | "reset" | "update";

export function computerSupportsUpdate(kind: string): boolean {
  return kind !== "desktop";
}

export async function replaceComputer(
  deps: {
    prisma: PrismaClient;
    sandbox: SandboxProvider;
    home: AgentHomeStore;
    jobs: JobPublisher;
    events: ThreadEvents;
    dataDir?: string;
  },
  computerId: string,
  mode: ComputerReplaceMode,
  context: AdapterContext,
  controlHolder: "bot" | "none" = "none",
  opts?: { force?: boolean },
): Promise<ComputerRef> {
  const force = Boolean(opts?.force);
  let existing = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
  if (existing.controlLeaseId && !hasActiveComputerControl(existing)) {
    await expireComputerControl(deps, existing.id, existing.controlLeaseId);
    existing = await deps.prisma.computer.findUniqueOrThrow({ where: { id: computerId } });
    if (!force && existing.controlLeaseId && !hasActiveComputerControl(existing)) {
      throw new Error("computer control revocation is still in progress");
    }
  }
  const botId = context.botId;
  if (!botId) throw new Error("computer replacement requires a bot id");
  if (!force && hasActiveComputerControl(existing)) {
    throw new ComputerBusyError();
  }
  if (!force && (existing.state === "booting" || existing.state === "suspending")) {
    throw new ComputerBusyError();
  }

  const previousState = existing.state;
  let claimedSuspending = false;
  if (force) {
    await deps.prisma.computer.update({
      where: { id: computerId },
      data: {
        state: "suspending",
        controlHolder: "none",
        controlLeaseId: null,
        controlLeaseExpiresAt: null,
        controlBotId: null,
        controlRunId: null,
      },
    });
    claimedSuspending = true;
  } else if (existing.state !== "stopped" && existing.state !== "suspended") {
    const now = new Date();
    const claimed = await deps.prisma.computer.updateMany({
      where: {
        id: computerId,
        state: { notIn: ["booting", "suspending", "stopped", "suspended"] },
        executionLeases: { none: { botId: { not: botId }, expiresAt: { gt: now } } },
        OR: [
          { controlHolder: { not: "user" } },
          { controlLeaseId: null },
          { controlLeaseExpiresAt: null },
          { controlLeaseExpiresAt: { lte: now } },
        ],
      },
      data: { state: "suspending" },
    });
    if (claimed.count !== 1) throw new ComputerBusyError();
    claimedSuspending = true;
  }
  const activeRun = force
    ? null
    : await deps.prisma.run.findFirst({
        where: {
          status: { in: [...ACTIVE_RUN_STATUSES] },
          bot: { computerId },
        },
        select: { id: true },
      });
  if (activeRun) {
    if (claimedSuspending) {
      await deps.prisma.computer.updateMany({
        where: { id: computerId, state: "suspending" },
        data: { state: previousState },
      });
    }
    throw new ComputerBusyError();
  }

  const oldRef = existing.providerRef
    ? toComputerRef(existing)
    : force
      ? {
          id: existing.homeKey,
          botId: existing.homeKey,
          kind: existing.kind as ComputerRef["kind"],
          providerRef: existing.homeKey,
        }
      : null;
  try {
    if (oldRef && existing.state === "running" && mode !== "reset" && !force) {
      try {
        await checkpointAndRecordComputerWorkspace(deps, existing, oldRef, context);
      } catch (error) {
        if (!isUnrecoverableSandboxError(error)) throw error;
      }
    }
    if (oldRef) {
      await deps.sandbox.releaseScreen?.(oldRef, context).catch(() => undefined);
      try {
        await deps.sandbox.destroy(oldRef, context);
      } catch (error) {
        if (force || mode === "recover" || isUnrecoverableSandboxError(error)) {
          // Stale provider refs still have to yield a fresh computer.
        } else {
          throw error;
        }
      }
    }
    await deps.prisma.computer.update({
      where: { id: computerId },
      data: {
        state: "stopped",
        providerRef: null,
        controlHolder: "none",
        controlLeaseId: null,
        controlLeaseExpiresAt: null,
        controlBotId: null,
        controlRunId: null,
      },
    });
    return provisionComputer(deps, computerId, context, controlHolder);
  } catch (error) {
    await deps.prisma.computer
      .updateMany({
        where: { id: computerId },
        data: { state: "error" },
      })
      .catch(() => undefined);
    throw error;
  }
}
