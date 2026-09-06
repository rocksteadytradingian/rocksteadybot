import type { SentinelObservation } from "@rakazo/core";
import { describe, expect, it, vi } from "vitest";
import {
  runSentinelTick,
  type SentinelDefinition,
  type SentinelTickDeps,
} from "./sentinel-runner.js";

const NOW = new Date("2026-09-07T12:00:00.000Z");

function deps(over: Partial<SentinelTickDeps> = {}): SentinelTickDeps & {
  persistState: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
  startRun: ReturnType<typeof vi.fn>;
  scheduleFollowUp: ReturnType<typeof vi.fn>;
} {
  return {
    observe: vi.fn(async (): Promise<SentinelObservation> => ({ ok: true, value: "red" })),
    persistState: vi.fn(async () => undefined),
    notify: vi.fn(async () => undefined),
    startRun: vi.fn(async () => undefined),
    scheduleFollowUp: vi.fn(async () => undefined),
    now: () => NOW,
    ...over,
  } as never;
}

const sentinel = (over: Partial<SentinelDefinition> = {}): SentinelDefinition => ({
  id: "s1",
  trigger: "becomes-true",
  onFire: { action: "notify", message: "deploy went red" },
  ...over,
});

describe("runSentinelTick", () => {
  it("persists state and notifies on a becomes-true edge", async () => {
    const d = deps();
    const result = await runSentinelTick(sentinel(), d);
    expect(result.fired).toBe(true);
    expect(d.persistState).toHaveBeenCalledWith({
      ok: true,
      value: "red",
      since: NOW.toISOString(),
    });
    expect(d.notify).toHaveBeenCalledWith("deploy went red", { ok: true, value: "red" });
    expect(d.startRun).not.toHaveBeenCalled();
  });

  it("does not fire (but still persists) when the edge has already passed", async () => {
    const d = deps();
    const result = await runSentinelTick(
      sentinel({ state: { ok: true, value: "red", since: "2026-09-07T11:00:00.000Z" } }),
      d,
    );
    expect(result.fired).toBe(false);
    expect(d.persistState).toHaveBeenCalledOnce();
    expect(d.notify).not.toHaveBeenCalled();
  });

  it("starts a run for a run-action sentinel", async () => {
    const d = deps({ observe: vi.fn(async () => ({ ok: true, value: "12" })) });
    await runSentinelTick(
      sentinel({
        trigger: "changes",
        onFire: { action: "run", prompt: "summarise the change" },
        state: { ok: true, value: "11", since: NOW.toISOString() },
      }),
      d,
    );
    expect(d.startRun).toHaveBeenCalledWith("summarise the change", { ok: true, value: "12" });
  });

  it("arms a follow-up for a not-yet-ripe stays-true-for", async () => {
    const d = deps({ observe: vi.fn(async () => ({ ok: true, value: "backed up" })) });
    const result = await runSentinelTick(
      sentinel({ trigger: "stays-true-for", windowMs: 900_000 }),
      d,
    );
    expect(result.fired).toBe(false);
    expect(d.scheduleFollowUp).toHaveBeenCalledWith(new Date(NOW.getTime() + 900_000));
  });

  it("is a no-op when the observation throws", async () => {
    const d = deps({
      observe: vi.fn(async () => {
        throw new Error("probe unreachable");
      }),
    });
    const result = await runSentinelTick(sentinel(), d);
    expect(result).toEqual({ fired: false, error: "probe unreachable" });
    expect(d.persistState).not.toHaveBeenCalled();
  });
});
