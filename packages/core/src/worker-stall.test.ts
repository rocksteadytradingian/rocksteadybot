import { PRODUCT_NAME } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  canRepairHostStack,
  collectStalledRuns,
  isLoopbackWebOrigin,
  isStackRepairApproval,
  mergeStallApproval,
  nodeTsxStartArgv,
  shouldSpawnDelayedApiStart,
  STACK_REPAIR_APPROVAL_ID,
  STACK_REPAIR_ENTRIES,
  windowsHiddenStartArgv,
  workerHealthPort,
  workerRepairApproval,
} from "./worker-stall.js";

const now = new Date("2026-08-28T09:10:00.000Z");

describe("collectStalledRuns", () => {
  it("flags queued runs older than the stall window", () => {
    const stalled = collectStalledRuns(
      [
        {
          status: "queued",
          updatedAt: new Date("2026-08-28T09:09:00.000Z"),
          leaseExpiresAt: null,
        },
        {
          status: "queued",
          updatedAt: new Date("2026-08-28T09:09:50.000Z"),
          leaseExpiresAt: null,
        },
      ],
      now,
    );
    expect(stalled).toHaveLength(1);
    expect(stalled[0]?.updatedAt.toISOString()).toBe("2026-08-28T09:09:00.000Z");
  });

  it("flags leased and running work whose lease has expired", () => {
    expect(
      collectStalledRuns(
        [
          {
            status: "running",
            updatedAt: new Date("2026-08-28T09:00:00.000Z"),
            leaseExpiresAt: new Date("2026-08-28T09:09:00.000Z"),
          },
          {
            status: "running",
            updatedAt: new Date("2026-08-28T09:09:50.000Z"),
            leaseExpiresAt: new Date("2026-08-28T09:11:00.000Z"),
          },
        ],
        now,
      ),
    ).toHaveLength(1);
  });

  it("ignores completed work", () => {
    expect(
      collectStalledRuns(
        [
          {
            status: "completed",
            updatedAt: new Date("2026-08-28T08:00:00.000Z"),
            leaseExpiresAt: null,
          },
        ],
        now,
      ),
    ).toEqual([]);
  });
});

describe("workerRepairApproval", () => {
  it("builds a high-risk Approvals card", () => {
    const item = workerRepairApproval(
      {
        stalledRunCount: 1,
        oldestQueuedAt: "2026-08-28T08:45:27.000Z",
        supervisorDown: true,
      },
      now,
    );
    expect(item.id).toBe(STACK_REPAIR_APPROVAL_ID);
    expect(item.kind).toBe("stack_repair");
    expect(item.botName).toBe(PRODUCT_NAME);
    expect(item.highRisk).toBe(true);
    expect(item.summary).toBe("AI replies are stuck");
    expect(item.detail).toContain("1 message is waiting");
    expect(item.detail).toContain("sandbox supervisor");
    expect(isStackRepairApproval(item)).toBe(true);
  });

  it("prepends once and skips empty stalls", () => {
    const existing = [
      {
        id: "effect-1",
        runId: "run-1",
        messageId: "msg-1",
        threadId: "thread-1",
        botId: "bot-1",
        botName: "Chief",
        groupId: null,
        groupName: null,
        summary: "send mail",
        toolName: "gmail_send_email",
        highRisk: true,
        requestedAt: "2026-08-28T09:00:00.000Z",
        kind: "ask" as const,
      },
    ];
    const stall = {
      stalledRunCount: 2,
      oldestQueuedAt: "2026-08-28T08:45:27.000Z",
      supervisorDown: false,
    };
    const merged = mergeStallApproval(existing, stall, now);
    expect(merged).toHaveLength(2);
    expect(isStackRepairApproval(merged[0]!)).toBe(true);
    expect(mergeStallApproval(merged, stall, now)).toHaveLength(2);
    expect(mergeStallApproval(existing, null, now)).toEqual(existing);
  });
});

describe("nodeTsxStartArgv", () => {
  it("uses a fixed tsx entry with no shell", () => {
    expect(nodeTsxStartArgv("/repo/node_modules/tsx/dist/cli.mjs", "src/index.ts")).toEqual({
      command: "node",
      args: ["/repo/node_modules/tsx/dist/cli.mjs", "src/index.ts"],
    });
    expect(STACK_REPAIR_ENTRIES.worker.dir).toBe("apps/worker");
    expect(STACK_REPAIR_ENTRIES.supervisor.dir).toBe("infra/sandboxes/supervisor");
    expect(STACK_REPAIR_ENTRIES.api.dir).toBe("apps/api");
  });
});

describe("windowsHiddenStartArgv", () => {
  it("runs wscript with a fixed helper and no shell metacharacters", () => {
    expect(
      windowsHiddenStartArgv(
        "C:\\repo\\apps\\api\\scripts\\hidden-start.vbs",
        "C:\\repo\\apps\\worker",
        "C:\\Program Files\\nodejs\\node.exe",
        ["C:\\repo\\node_modules\\tsx\\dist\\cli.mjs", "src/index.ts"],
      ),
    ).toEqual({
      command: "wscript.exe",
      args: [
        "//nologo",
        "C:\\repo\\apps\\api\\scripts\\hidden-start.vbs",
        "C:\\repo\\apps\\worker",
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\repo\\node_modules\\tsx\\dist\\cli.mjs",
        "src/index.ts",
      ],
    });
    expect(
      windowsHiddenStartArgv("vbs", "cwd", "node", ["tsx", "src/index.ts"]).args.join(" "),
    ).not.toMatch(/[;&|`$]/);
  });
});

describe("canRepairHostStack", () => {
  it("lets a local signed-in user repair the stack without being the deployment owner", () => {
    expect(isLoopbackWebOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isLoopbackWebOrigin("https://rakazo.example.com")).toBe(false);
    expect(canRepairHostStack(false, "http://127.0.0.1:5173")).toBe(true);
    expect(canRepairHostStack(false, "https://rakazo.example.com")).toBe(false);
    expect(canRepairHostStack(true, "https://rakazo.example.com")).toBe(true);
  });
});

describe("shouldSpawnDelayedApiStart", () => {
  it("skips a second spawn under pnpm dev", () => {
    expect(shouldSpawnDelayedApiStart({ npm_lifecycle_event: "dev" })).toBe(false);
    expect(shouldSpawnDelayedApiStart({ npm_lifecycle_event: "start" })).toBe(true);
    expect(shouldSpawnDelayedApiStart({})).toBe(true);
  });
});

describe("workerHealthPort", () => {
  it("defaults to 3102 and accepts a valid WORKER_PORT", () => {
    expect(workerHealthPort({})).toBe(3102);
    expect(workerHealthPort({ WORKER_PORT: "3205" })).toBe(3205);
  });

  it("rejects an invalid WORKER_PORT", () => {
    expect(() => workerHealthPort({ WORKER_PORT: "0" })).toThrow(/WORKER_PORT/);
    expect(() => workerHealthPort({ WORKER_PORT: "abc" })).toThrow(/WORKER_PORT/);
  });
});
