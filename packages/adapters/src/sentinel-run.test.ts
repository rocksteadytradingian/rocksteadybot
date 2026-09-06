import { describe, expect, it, vi } from "vitest";
import { type SentinelRunDeps, startSentinelRun } from "./sentinel-run.js";

const input = {
  workspaceId: "ws-1",
  botId: "bot-1",
  userId: "user-1",
  prompt: "investigate the outage",
};

function deps(over: { bot?: unknown; enqueue?: ReturnType<typeof vi.fn> } = {}) {
  const taskCreate = vi.fn(async () => ({ id: "task-1" }));
  const runCreate = vi.fn(async () => ({ id: "run-1", taskId: "task-1" }));
  const runDeleteMany = vi.fn(async () => ({ count: 1 }));
  const taskDeleteMany = vi.fn(async () => ({ count: 1 }));
  const tx = {
    task: { create: taskCreate, deleteMany: taskDeleteMany },
    run: { create: runCreate, deleteMany: runDeleteMany },
  };
  const enqueue = over.enqueue ?? vi.fn(async () => undefined);
  return {
    d: {
      prisma: {
        bot: {
          findUnique: vi.fn(async () =>
            over.bot === undefined ? { id: "bot-1", thread: { id: "th-1" } } : over.bot,
          ),
        },
        $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      },
      jobs: { enqueue },
    } as unknown as SentinelRunDeps,
    taskCreate,
    runCreate,
    runDeleteMany,
    taskDeleteMany,
    enqueue,
  };
}

describe("startSentinelRun", () => {
  it("creates a queued task + run and enqueues the continuation", async () => {
    const t = deps();
    const result = await startSentinelRun(t.d, input);
    expect(result).toEqual({ started: true, runId: "run-1" });
    expect(t.runCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ trigger: "sentinel", status: "queued", threadId: "th-1" }),
      }),
    );
    expect(t.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: "run.continue", payload: { runId: "run-1" } }),
    );
  });

  it("does nothing when the bot has no thread", async () => {
    const t = deps({ bot: { id: "bot-1", thread: null } });
    expect(await startSentinelRun(t.d, input)).toEqual({ started: false });
    expect(t.runCreate).not.toHaveBeenCalled();
  });

  it("rolls the rows back and rethrows when the queue is unreachable", async () => {
    const t = deps({
      enqueue: vi.fn(async () => {
        throw new Error("queue down");
      }),
    });
    await expect(startSentinelRun(t.d, input)).rejects.toThrow("queue down");
    expect(t.runDeleteMany).toHaveBeenCalledWith({ where: { id: "run-1", status: "queued" } });
    expect(t.taskDeleteMany).toHaveBeenCalledWith({ where: { id: "task-1", status: "queued" } });
  });
});
