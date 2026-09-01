import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HIDDEN_START_SCRIPT } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { findRepoRoot, inspectWorkerStall, repairWorkerStack } from "./worker-health.js";

describe("inspectWorkerStall", () => {
  it("returns null when jobs run in-process", async () => {
    const prisma = { run: { findMany: vi.fn() } } as unknown as PrismaClient;
    expect(await inspectWorkerStall(prisma, { wakeupDriver: "memory" })).toBeNull();
    expect(prisma.run.findMany).not.toHaveBeenCalled();
  });

  it("returns a stall when queued work is old and the supervisor is down", async () => {
    const updatedAt = new Date("2026-08-28T08:45:27.000Z");
    const prisma = {
      run: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ status: "queued", updatedAt, leaseExpiresAt: null }]),
      },
    } as unknown as PrismaClient;
    const pingSupervisor = vi.fn().mockResolvedValue(false);
    await expect(
      inspectWorkerStall(prisma, {
        wakeupDriver: "graphile",
        supervisorUrl: "http://127.0.0.1:7091",
        now: new Date("2026-08-28T09:10:00.000Z"),
        pingSupervisor,
      }),
    ).resolves.toEqual({
      stalledRunCount: 1,
      oldestQueuedAt: updatedAt.toISOString(),
      supervisorDown: true,
    });
    expect(pingSupervisor).toHaveBeenCalledWith("http://127.0.0.1:7091");
  });
});

describe("repairWorkerStack", () => {
  it("spawns worker and supervisor from the checkout with fixed argv", async () => {
    const spawned: Array<{ command: string; args: string[]; cwd: string }> = [];
    const result = await repairWorkerStack({
      supervisorUrl: "http://127.0.0.1:7091",
      cwd: "/repo",
      findRepoRoot: () => "/repo",
      resolveTsx: () => "/repo/node_modules/tsx/dist/cli.mjs",
      pingSupervisor: async () => false,
      spawnProcess: (command, args, cwd) => {
        spawned.push({ command, args, cwd });
        return { unref() {} } as never;
      },
    });
    expect(result).toEqual({ ok: true, started: ["supervisor", "worker"] });
    expect(spawned.map((row) => row.cwd)).toEqual([
      expect.stringMatching(/infra[\\/]sandboxes[\\/]supervisor$/),
      expect.stringMatching(/apps[\\/]worker$/),
    ]);
    for (const row of spawned) {
      expect(row.args).toEqual(["/repo/node_modules/tsx/dist/cli.mjs", "src/index.ts"]);
      expect(row.args.join(" ")).not.toMatch(/[;&|`$]/);
    }
  });

  it("skips supervisor when it is already reachable", async () => {
    const spawned: string[] = [];
    const result = await repairWorkerStack({
      findRepoRoot: () => "/repo",
      resolveTsx: () => "/tsx",
      pingSupervisor: async () => true,
      spawnProcess: (_command, _args, cwd) => {
        spawned.push(cwd);
        return { unref() {} } as never;
      },
    });
    expect(result).toEqual({ ok: true, started: ["worker"] });
    expect(spawned).toHaveLength(1);
  });

  it("schedules a delayed API relaunch with a fixed helper argv", async () => {
    const repoRoot = findRepoRoot(process.cwd());
    expect(repoRoot).toBeTruthy();
    const spawned: Array<{ args: string[]; cwd: string }> = [];
    const result = await repairWorkerStack({
      restartApi: true,
      spawnDelayedApi: true,
      cwd: repoRoot ?? undefined,
      resolveTsx: () => "/tsx",
      pingSupervisor: async () => true,
      spawnProcess: (_command, args, cwd) => {
        spawned.push({ args, cwd });
        return { unref() {} } as never;
      },
    });
    expect(result).toEqual({ ok: true, started: ["worker", "api"] });
    expect(spawned).toHaveLength(2);
    expect(spawned[1]?.cwd).toMatch(/apps[\\/]api$/);
    expect(spawned[1]?.args[0]).toMatch(/delayed-start\.mjs$/);
    expect(spawned[1]?.args[1]).toBe("1500");
    expect(spawned[1]?.args[2]).toBe("/tsx");
    expect(spawned[1]?.args[3]).toBe("src/index.ts");
    expect(spawned[1]?.args.join(" ")).not.toMatch(/[;&|`$]/);
  });

  it("does not spawn a second API when the dev watcher will relaunch it", async () => {
    const spawned: string[] = [];
    const result = await repairWorkerStack({
      restartApi: true,
      spawnDelayedApi: false,
      findRepoRoot: () => "/repo",
      resolveTsx: () => "/tsx",
      pingSupervisor: async () => true,
      spawnProcess: (_command, args) => {
        spawned.push(args.join(" "));
        return { unref() {} } as never;
      },
    });
    expect(result).toEqual({ ok: true, started: ["worker"] });
    expect(spawned.some((row) => row.includes("delayed-start.mjs"))).toBe(false);
  });

  it("explains when the checkout is missing", async () => {
    await expect(
      repairWorkerStack({
        findRepoRoot: () => null,
        spawnProcess: () => {
          throw new Error("must not spawn");
        },
      }),
    ).resolves.toMatchObject({ ok: false, started: [] });
  });
});

describe("findRepoRoot", () => {
  it("walks up from apps/api to this checkout", () => {
    const root = findRepoRoot(process.cwd());
    expect(root).toBeTruthy();
  });
});

describe("hidden-start.vbs", () => {
  it("launches node with no console and keeps it after wscript exits", async () => {
    if (process.platform !== "win32") return;
    const repoRoot = findRepoRoot(process.cwd());
    expect(repoRoot).toBeTruthy();
    const dir = mkdtempSync(path.join(tmpdir(), "rakazo-hidden-start-"));
    const marker = path.join(dir, "ok.txt");
    const child = spawn(
      "wscript.exe",
      [
        "//nologo",
        path.join(repoRoot!, HIDDEN_START_SCRIPT),
        dir,
        process.execPath,
        "-e",
        "require('fs').writeFileSync('ok.txt', 'ok')",
      ],
      { stdio: "ignore", windowsHide: true },
    );
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`wscript exited ${code}`));
      });
    });
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      try {
        expect(readFileSync(marker, "utf8")).toBe("ok");
        rmSync(dir, { recursive: true, force: true });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    rmSync(dir, { recursive: true, force: true });
    throw new Error("hidden-start.vbs did not start node");
  });
});
