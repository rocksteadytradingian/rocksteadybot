import { describe, expect, it, vi } from "vitest";
import {
  cancelSentinelFromTool,
  createSentinelFromTool,
  listSentinelsFromTool,
} from "./sentinel-tools.js";

const spec = {
  name: "prod health",
  check: { kind: "http-ok", url: "https://status.example.test/health" },
  trigger: "becomes-true",
  onFire: { kind: "notify", message: "prod is back" },
};

function deps(over: Record<string, unknown> = {}) {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "sen-1",
    ...data,
    lastCheckedAt: null,
  }));
  return {
    prisma: {
      sentinel: {
        create,
        delete: vi.fn(async () => undefined),
        update: vi.fn(async () => undefined),
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
        ...(over.sentinel ?? {}),
      },
    },
    events: { append: vi.fn(async () => undefined) },
    jobs: { enqueue: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined) },
  } as unknown as Parameters<typeof createSentinelFromTool>[0] & {
    prisma: { sentinel: Record<string, ReturnType<typeof vi.fn>> };
    events: { append: ReturnType<typeof vi.fn> };
    jobs: { enqueue: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
  };
}

const ctx = {
  workspaceId: "ws-1",
  botId: "bot-1",
  userId: "user-1",
  threadId: "thread-1",
};

describe("createSentinelFromTool", () => {
  it("persists a sentinel, enqueues a wakeup, and signals the thread", async () => {
    const d = deps();
    const result = await createSentinelFromTool(d, {
      ...ctx,
      spec,
      schedule: { every: 5, unit: "minutes" },
    });
    expect(result).toMatchObject({ ok: true, sentinelId: "sen-1", name: "prod health" });
    expect(d.prisma.sentinel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trigger: "becomes-true",
          cron: "*/5 * * * *",
          active: true,
        }),
      }),
    );
    expect(d.jobs.enqueue).toHaveBeenCalledOnce();
    expect(d.events.append).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sentinel.created", payload: { name: "prod health" } }),
    );
  });

  it("rejects an invalid spec before touching the database", async () => {
    const d = deps();
    const result = await createSentinelFromTool(d, {
      ...ctx,
      spec: { ...spec, trigger: "stays-true-for" },
      schedule: { every: 5, unit: "minutes" },
    });
    expect(result).toEqual({ error: "stays-true-for needs a window (e.g. 15m)" });
    expect(d.prisma.sentinel.create).not.toHaveBeenCalled();
  });

  it("rejects a one-shot schedule", async () => {
    const d = deps();
    const result = await createSentinelFromTool(d, {
      ...ctx,
      spec,
      schedule: { delayMinutes: 10 },
    });
    expect(result).toEqual({ error: "A sentinel needs a repeating check, not a one-shot time." });
  });

  it("rolls back the row when the wakeup cannot be enqueued", async () => {
    const remove = vi.fn(async () => undefined);
    const d = deps({ sentinel: { delete: remove } });
    d.jobs.enqueue.mockRejectedValueOnce(new Error("queue down"));
    const result = await createSentinelFromTool(d, {
      ...ctx,
      spec,
      schedule: { every: 5, unit: "minutes" },
    });
    expect(result).toEqual({ error: "Could not start the sentinel. Try again." });
    expect(remove).toHaveBeenCalledWith({ where: { id: "sen-1" } });
  });

  it("stores window milliseconds for a stays-true-for sentinel", async () => {
    const d = deps();
    await createSentinelFromTool(d, {
      ...ctx,
      spec: { ...spec, trigger: "stays-true-for", window: "15m" },
      schedule: { every: 5, unit: "minutes" },
    });
    expect(d.prisma.sentinel.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ windowMs: 900_000 }) }),
    );
  });
});

describe("listSentinelsFromTool / cancelSentinelFromTool", () => {
  it("scopes the list to workspace, bot, and user", async () => {
    const d = deps();
    await listSentinelsFromTool(d, { workspaceId: "ws-1", botId: "bot-1", userId: "user-1" });
    expect(d.prisma.sentinel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-1", botId: "bot-1", userId: "user-1" },
      }),
    );
  });

  it("needs an id or a name to cancel", async () => {
    const d = deps();
    expect(await cancelSentinelFromTool(d, { ...ctx })).toEqual({
      error: "Provide sentinelId or the exact sentinel name to cancel.",
    });
  });

  it("deletes the row and cancels the queued job", async () => {
    const del = vi.fn(async () => undefined);
    const d = deps({
      sentinel: {
        findFirst: vi.fn(async () => ({ id: "sen-9", name: "prod health" })),
        delete: del,
      },
    });
    const result = await cancelSentinelFromTool(d, { ...ctx, sentinelId: "sen-9" });
    expect(result).toEqual({ ok: true, sentinelId: "sen-9", name: "prod health" });
    expect(del).toHaveBeenCalledWith({ where: { id: "sen-9" } });
    expect(d.jobs.cancel).toHaveBeenCalledWith("sentinel:sen-9");
  });
});
