import { describe, expect, it, vi } from "vitest";
import { type SentinelWakeDeps, wakeSentinel } from "./sentinel-wake.js";

const SCHEDULED = "2026-09-07T12:00:00.000Z";
const NOW = new Date("2026-09-07T12:00:01.000Z");

function row(over: Record<string, unknown> = {}) {
  return {
    id: "sen-1",
    workspaceId: "ws-1",
    botId: "bot-1",
    userId: "user-1",
    name: "prod health",
    check: { kind: "http-ok", url: "https://status.example.test/health" },
    trigger: "becomes-true",
    windowMs: null,
    onFire: { kind: "notify", message: "prod is back" },
    active: true,
    state: null,
    cron: "*/5 * * * *",
    timezone: "UTC",
    nextRunAt: new Date(SCHEDULED),
    ...over,
  };
}

function deps(over: Partial<SentinelWakeDeps> & { row?: Record<string, unknown> } = {}) {
  const sentinelRow = over.row === undefined ? row() : over.row;
  const update = vi.fn(async () => undefined);
  const append = vi.fn(async () => undefined);
  const enqueue = vi.fn(async () => undefined);
  const startRun = vi.fn(async () => undefined);
  return {
    deps: {
      prisma: {
        sentinel: { findUnique: vi.fn(async () => sentinelRow), update },
        bot: {
          findUnique: vi.fn(async () => ({ id: "bot-1", thread: { id: "thread-1" } })),
        },
      },
      jobs: { enqueue, cancel: vi.fn(async () => undefined) },
      events: { append },
      runCheck: over.runCheck ?? vi.fn(async () => ({ ok: true, value: "200" })),
      startRun,
      now: () => NOW,
    } as unknown as SentinelWakeDeps,
    update,
    append,
    enqueue,
    startRun,
  };
}

describe("wakeSentinel", () => {
  it("notifies on a becomes-true edge and re-arms the poll", async () => {
    const t = deps();
    const result = await wakeSentinel(t.deps, "sen-1", SCHEDULED);
    expect(result).toEqual({ fired: true });
    expect(t.append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sentinel.fired",
        payload: expect.objectContaining({ observed: "200" }),
      }),
    );
    expect(t.enqueue).toHaveBeenCalledOnce();
    // state persisted, then nextRunAt re-armed
    expect(t.update).toHaveBeenCalledTimes(2);
  });

  it("does not notify when the edge already passed but still re-arms", async () => {
    const t = deps({
      row: row({ state: { ok: true, value: "200", since: "2026-09-07T11:00:00.000Z" } }),
    });
    const result = await wakeSentinel(t.deps, "sen-1", SCHEDULED);
    expect(result).toEqual({ fired: false });
    expect(t.append).not.toHaveBeenCalled();
    expect(t.enqueue).toHaveBeenCalledOnce();
  });

  it("starts a run for a run-action sentinel", async () => {
    const t = deps({
      row: row({
        trigger: "changes",
        onFire: { kind: "run", prompt: "summarise the change" },
        state: { ok: true, value: "200", since: "2026-09-07T11:00:00.000Z" },
      }),
      runCheck: vi.fn(async () => ({ ok: true, value: "503" })),
    });
    await wakeSentinel(t.deps, "sen-1", SCHEDULED);
    expect(t.startRun).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "summarise the change", botId: "bot-1" }),
    );
  });

  it("re-arms without an error return when the check fails, and does not persist state", async () => {
    const t = deps({
      runCheck: vi.fn(async () => {
        throw new Error("probe unreachable");
      }),
    });
    const result = await wakeSentinel(t.deps, "sen-1", SCHEDULED);
    expect(result).toEqual({ fired: false, error: "probe unreachable" });
    // only the nextRunAt re-arm update, no persistState
    expect(t.update).toHaveBeenCalledOnce();
    expect(t.enqueue).toHaveBeenCalledOnce();
  });

  it("drops a superseded wakeup", async () => {
    const t = deps({ row: row({ nextRunAt: new Date("2026-09-07T13:00:00.000Z") }) });
    const result = await wakeSentinel(t.deps, "sen-1", SCHEDULED);
    expect(result).toEqual({ fired: false, skipped: "superseded" });
    expect(t.enqueue).not.toHaveBeenCalled();
  });

  it("skips an inactive sentinel", async () => {
    const t = deps({ row: row({ active: false }) });
    expect(await wakeSentinel(t.deps, "sen-1", SCHEDULED)).toEqual({
      fired: false,
      skipped: "inactive",
    });
  });

  it("arms the stays-true-for follow-up when it lands before the next poll", async () => {
    const t = deps({
      row: row({
        trigger: "stays-true-for",
        windowMs: 120_000,
        onFire: { kind: "notify", message: "held" },
        state: { ok: true, value: "200", since: NOW.toISOString() },
      }),
    });
    await wakeSentinel(t.deps, "sen-1", SCHEDULED);
    const job = t.enqueue.mock.calls.at(0)?.at(0) as
      | { payload: { scheduledFor: string } }
      | undefined;
    expect(new Date(job?.payload.scheduledFor ?? 0).getTime()).toBe(NOW.getTime() + 120_000);
  });
});
