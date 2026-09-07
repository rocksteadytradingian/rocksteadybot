import { type PendingApproval, PRODUCT_NAME } from "@rakazo/contracts";

export const WORKER_STALL_MS = 20_000;
export const STACK_REPAIR_APPROVAL_ID = "ops:worker-repair";
export const STACK_REPAIR_TOOL = "stack.repair";

export const STACK_REPAIR_ENTRIES = {
  worker: { dir: "apps/worker", entry: "src/index.ts" },
  supervisor: { dir: "infra/sandboxes/supervisor", entry: "src/index.ts" },
  api: { dir: "apps/api", entry: "src/index.ts" },
} as const;

export const API_RESTART_DELAY_MS = 1_500;
export const DELAYED_API_START_SCRIPT = "apps/api/scripts/delayed-start.mjs";
export const HIDDEN_START_SCRIPT = "apps/api/scripts/hidden-start.vbs";
export const DEFAULT_WORKER_HEALTH_PORT = 3102;

/** `pnpm dev` / `tsx watch` already owns this process; a second spawn fights for the port. */
export function shouldSpawnDelayedApiStart(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.npm_lifecycle_event !== "dev";
}

export function workerHealthPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.WORKER_PORT?.trim();
  if (!raw) return DEFAULT_WORKER_HEALTH_PORT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > 65_535) {
    throw new Error(`WORKER_PORT must be an integer 1-65535, received "${raw}"`);
  }
  return value;
}

export type StackRepairService = keyof typeof STACK_REPAIR_ENTRIES;

export type StalledRun = {
  status: string;
  updatedAt: Date;
  leaseExpiresAt: Date | null;
};

export type WorkerStall = {
  stalledRunCount: number;
  oldestQueuedAt: string;
  supervisorDown: boolean;
};

export function isStalledRun(
  run: StalledRun,
  now = new Date(),
  stallMs = WORKER_STALL_MS,
): boolean {
  if (run.status === "queued") return run.updatedAt.getTime() <= now.getTime() - stallMs;
  if (run.status === "leased" || run.status === "running") {
    return run.leaseExpiresAt !== null && run.leaseExpiresAt.getTime() <= now.getTime();
  }
  return false;
}

export function collectStalledRuns(
  runs: readonly StalledRun[],
  now = new Date(),
  stallMs = WORKER_STALL_MS,
): StalledRun[] {
  return runs.filter((run) => isStalledRun(run, now, stallMs));
}

export function isStackRepairApproval(item: {
  id?: string;
  kind?: string;
  toolName?: string;
}): boolean {
  return (
    item.kind === "stack_repair" ||
    item.id === STACK_REPAIR_APPROVAL_ID ||
    item.toolName === STACK_REPAIR_TOOL
  );
}

export function workerRepairApproval(stall: WorkerStall, now = new Date()): PendingApproval {
  const waiting =
    stall.stalledRunCount === 1
      ? "1 message is waiting"
      : `${stall.stalledRunCount} messages are waiting`;
  const supervisor = stall.supervisorDown ? " The sandbox supervisor is also down." : "";
  return {
    id: STACK_REPAIR_APPROVAL_ID,
    kind: "stack_repair",
    runId: STACK_REPAIR_APPROVAL_ID,
    messageId: STACK_REPAIR_APPROVAL_ID,
    threadId: STACK_REPAIR_APPROVAL_ID,
    botId: STACK_REPAIR_APPROVAL_ID,
    botName: PRODUCT_NAME,
    groupId: null,
    groupName: null,
    summary: "AI replies are stuck",
    detail: `${waiting} because the job worker is not running.${supervisor} Approve to start the worker and sandbox supervisor.`,
    toolName: STACK_REPAIR_TOOL,
    highRisk: true,
    requestedAt: stall.oldestQueuedAt || now.toISOString(),
  };
}

export function mergeStallApproval(
  items: readonly PendingApproval[],
  stall: WorkerStall | null,
  now = new Date(),
): PendingApproval[] {
  if (!stall || stall.stalledRunCount < 1) return [...items];
  if (items.some(isStackRepairApproval)) return [...items];
  return [workerRepairApproval(stall, now), ...items];
}

/** Local Vite/API origins are a personal app: any signed-in user can repair the stack. */
export function isLoopbackWebOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.startsWith("127.") ||
      host === "::1"
    );
  } catch {
    return false;
  }
}

export function canRepairHostStack(isDeploymentOwner: boolean, webOrigin: string): boolean {
  return isDeploymentOwner || isLoopbackWebOrigin(webOrigin);
}

/** Argv for `node <tsxCli> src/index.ts` — no shell, no user-controlled strings. */
export function nodeTsxStartArgv(
  tsxCli: string,
  entry: string,
): { command: string; args: string[] } {
  return { command: "node", args: [tsxCli, entry] };
}

/**
 * Windows `detached: true` always allocates a console. wscript + hidden-start.vbs
 * starts the same argv with no window and keeps the child after the parent exits.
 */
export function windowsHiddenStartArgv(
  vbsPath: string,
  cwd: string,
  command: string,
  args: readonly string[],
): { command: string; args: string[] } {
  return {
    command: "wscript.exe",
    args: ["//nologo", vbsPath, cwd, command, ...args],
  };
}
