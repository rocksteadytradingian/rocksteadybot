import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { StackRepairResult } from "@rakazo/contracts";
import {
  API_RESTART_DELAY_MS,
  collectStalledRuns,
  DELAYED_API_START_SCRIPT,
  HIDDEN_START_SCRIPT,
  nodeTsxStartArgv,
  STACK_REPAIR_ENTRIES,
  type StackRepairService,
  shouldSpawnDelayedApiStart,
  WORKER_STALL_MS,
  type WorkerStall,
  windowsHiddenStartArgv,
} from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";

const SUPERVISOR_PING_MS = 1_500;
const WORKSPACE_WALK = 10;

export type InspectWorkerStallOptions = {
  wakeupDriver: string;
  workspaceId?: string;
  supervisorUrl?: string;
  now?: Date;
  stallMs?: number;
  pingSupervisor?: (url: string) => Promise<boolean>;
};

export async function inspectWorkerStall(
  prisma: PrismaClient,
  options: InspectWorkerStallOptions,
): Promise<WorkerStall | null> {
  if (options.wakeupDriver === "memory") return null;
  const now = options.now ?? new Date();
  const stallMs = options.stallMs ?? WORKER_STALL_MS;
  const cutoff = new Date(now.getTime() - stallMs);
  const rows = await prisma.run.findMany({
    where: {
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      OR: [
        { status: "queued", updatedAt: { lte: cutoff } },
        {
          status: { in: ["leased", "running"] },
          leaseExpiresAt: { lte: now },
        },
      ],
    },
    select: { status: true, updatedAt: true, leaseExpiresAt: true },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  const stalled = collectStalledRuns(rows, now, stallMs);
  if (stalled.length === 0) return null;
  const oldest = stalled[0]!;
  const supervisorUrl = options.supervisorUrl?.trim();
  const ping = options.pingSupervisor ?? pingSupervisorHealth;
  const supervisorDown = supervisorUrl ? !(await ping(supervisorUrl)) : false;
  return {
    stalledRunCount: stalled.length,
    oldestQueuedAt: oldest.updatedAt.toISOString(),
    supervisorDown,
  };
}

export type RepairWorkerStackOptions = {
  supervisorUrl?: string;
  restartApi?: boolean;
  cwd?: string;
  findRepoRoot?: (start: string) => string | null;
  resolveTsx?: (repoRoot: string) => string;
  spawnProcess?: (command: string, args: string[], cwd: string) => ChildProcess;
  pingSupervisor?: (url: string) => Promise<boolean>;
  spawnDelayedApi?: boolean;
};

let inFlight: Promise<StackRepairResult> | undefined;

export async function repairWorkerStack(
  options: RepairWorkerStackOptions = {},
): Promise<StackRepairResult> {
  if (inFlight) return inFlight;
  inFlight = runRepair(options).finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}

async function runRepair(options: RepairWorkerStackOptions): Promise<StackRepairResult> {
  try {
    return await runRepairInner(options);
  } catch (error) {
    return {
      ok: false,
      started: [],
      error: error instanceof Error ? error.message : "Could not restart the stack.",
    };
  }
}

async function runRepairInner(options: RepairWorkerStackOptions): Promise<StackRepairResult> {
  const started: StackRepairService[] = [];
  const findRoot = options.findRepoRoot ?? findRepoRoot;
  const repoRoot = findRoot(options.cwd ?? process.cwd());
  if (!repoRoot) {
    return {
      ok: false,
      started,
      error:
        "Could not find the checkout to start the worker. From the repo root run pnpm --filter @rakazo/worker start and pnpm --filter @rakazo/sandbox-supervisor start.",
    };
  }

  const ping = options.pingSupervisor ?? pingSupervisorHealth;
  const supervisorUrl = options.supervisorUrl?.trim() || "http://127.0.0.1:7091";
  const spawnProcess = options.spawnProcess ?? spawnDetached;
  let tsxCli: string;
  try {
    tsxCli = (options.resolveTsx ?? resolveTsxCli)(repoRoot);
  } catch {
    return {
      ok: false,
      started,
      error: "tsx is not installed in this checkout, so the worker cannot be started from here.",
    };
  }

  if (!(await ping(supervisorUrl))) {
    spawnService(spawnProcess, tsxCli, repoRoot, "supervisor");
    started.push("supervisor");
  }
  spawnService(spawnProcess, tsxCli, repoRoot, "worker");
  started.push("worker");
  if (options.restartApi) {
    const spawnDelayed = options.spawnDelayedApi ?? shouldSpawnDelayedApiStart();
    if (!spawnDelayed) {
      // `pnpm dev` / `tsx watch` already owns this process. Exiting it does not
      // relaunch the watcher — it just takes the API down (Vite then 500s).
      return { ok: true, started };
    }
    const helper = path.join(repoRoot, DELAYED_API_START_SCRIPT);
    if (!existsSync(helper)) {
      return {
        ok: false,
        started,
        error: "Could not schedule an API restart from this checkout.",
      };
    }
    spawnProcess(
      process.execPath,
      [helper, String(API_RESTART_DELAY_MS), tsxCli, STACK_REPAIR_ENTRIES.api.entry],
      path.join(repoRoot, STACK_REPAIR_ENTRIES.api.dir),
    );
    started.push("api");
  }
  return { ok: true, started };
}

type SpawnProcess = NonNullable<RepairWorkerStackOptions["spawnProcess"]>;

function spawnService(
  spawnProcess: SpawnProcess,
  tsxCli: string,
  repoRoot: string,
  service: StackRepairService,
): void {
  const entry = STACK_REPAIR_ENTRIES[service];
  const argv = nodeTsxStartArgv(tsxCli, entry.entry);
  spawnProcess(process.execPath, argv.args, path.join(repoRoot, entry.dir));
}

export function findRepoRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (let i = 0; i < WORKSPACE_WALK; i += 1) {
    if (
      existsSync(path.join(dir, "pnpm-workspace.yaml")) &&
      existsSync(
        path.join(dir, STACK_REPAIR_ENTRIES.worker.dir, STACK_REPAIR_ENTRIES.worker.entry),
      ) &&
      existsSync(
        path.join(dir, STACK_REPAIR_ENTRIES.supervisor.dir, STACK_REPAIR_ENTRIES.supervisor.entry),
      ) &&
      existsSync(path.join(dir, STACK_REPAIR_ENTRIES.api.dir, STACK_REPAIR_ENTRIES.api.entry))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function resolveTsxCli(repoRoot: string): string {
  const require = createRequire(path.join(repoRoot, "package.json"));
  try {
    return require.resolve("tsx/cli");
  } catch {
    const fallback = path.join(repoRoot, "node_modules/tsx/dist/cli.mjs");
    if (existsSync(fallback)) return fallback;
    throw new Error("tsx is not installed");
  }
}

function spawnDetached(command: string, args: string[], cwd: string): ChildProcess {
  // On Windows, `detached: true` always creates a console window. Start through
  // hidden-start.vbs so Restart API does not pop terminals.
  if (process.platform === "win32") {
    const repoRoot = findRepoRoot(cwd);
    const vbs = repoRoot ? path.join(repoRoot, HIDDEN_START_SCRIPT) : "";
    if (vbs && existsSync(vbs)) {
      const hidden = windowsHiddenStartArgv(vbs, cwd, command, args);
      const child = spawn(hidden.command, hidden.args, {
        cwd: repoRoot!,
        stdio: "ignore",
        windowsHide: true,
        env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
      });
      child.unref();
      return child;
    }
  }
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  });
  child.unref();
  return child;
}

export async function pingSupervisorHealth(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPERVISOR_PING_MS);
  try {
    const response = await fetch(joinUrl(url, "/health"), {
      signal: controller.signal,
      redirect: "manual",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function joinUrl(base: string, pathname: string): string {
  return `${base.replace(/\/+$/, "")}${pathname}`;
}
