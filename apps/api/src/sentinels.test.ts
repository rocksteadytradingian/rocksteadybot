import type { Actor } from "@rakazo/contracts";
import { IsolationError } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createSentinelsService } from "./sentinels.js";

const actor = { workspaceId: "ws-1", userId: "user-1" } as Actor;

function row(over: Record<string, unknown> = {}) {
  return {
    id: "sen-1",
    workspaceId: "ws-1",
    botId: "bot-1",
    name: "prod health",
    check: { kind: "http-ok", url: "https://status.example.test" },
    trigger: "becomes-true",
    windowMs: null,
    onFire: { kind: "notify", message: "prod is back" },
    active: true,
    state: null,
    lastCheckedAt: null,
    nextRunAt: new Date("2026-09-07T12:05:00.000Z"),
    createdAt: new Date("2026-09-07T12:00:00.000Z"),
    ...over,
  };
}

function prisma(over: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return {
    sentinel: {
      findMany: vi.fn(async () => [row()]),
      findFirst: vi.fn(async () => ({ id: "sen-1" })),
      delete: vi.fn(async () => undefined),
      ...over,
    },
  } as never;
}

describe("sentinels service", () => {
  it("lists a bot's sentinels as StoredSentinel, scoped to the owner", async () => {
    const p = prisma();
    const svc = createSentinelsService(p, { cancel: vi.fn(async () => undefined) });
    const list = await svc.list(actor, { botId: "bot-1" });
    expect(list[0]).toMatchObject({
      id: "sen-1",
      check: { kind: "http-ok", url: "https://status.example.test" },
      onFire: { kind: "notify" },
      nextRunAt: "2026-09-07T12:05:00.000Z",
    });
    expect(
      (p as never as { sentinel: { findMany: ReturnType<typeof vi.fn> } }).sentinel.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-1", userId: "user-1", botId: "bot-1" },
      }),
    );
  });

  it("cancel deletes the row and clears the queued wakeup", async () => {
    const del = vi.fn(async () => undefined);
    const cancel = vi.fn(async () => undefined);
    const svc = createSentinelsService(prisma({ delete: del }), { cancel });
    expect(await svc.cancel(actor, { sentinelId: "sen-1" })).toEqual({ ok: true });
    expect(del).toHaveBeenCalledWith({ where: { id: "sen-1" } });
    expect(cancel).toHaveBeenCalledWith("sentinel:sen-1");
  });

  it("cancel on a foreign id is an isolation error", async () => {
    const svc = createSentinelsService(prisma({ findFirst: vi.fn(async () => null) }), {
      cancel: vi.fn(async () => undefined),
    });
    await expect(svc.cancel(actor, { sentinelId: "sen-x" })).rejects.toBeInstanceOf(IsolationError);
  });
});
