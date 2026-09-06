import { compileRecordingToReplay, type ReplayStep } from "@rakazo/core";
import { describe, expect, it, vi } from "vitest";
import { type ReplayRunnerDeps, runReplay } from "./teach-replay-runner.js";

function deps(over: Partial<ReplayRunnerDeps> = {}): ReplayRunnerDeps & {
  sendInput: ReturnType<typeof vi.fn>;
  scroll: ReturnType<typeof vi.fn>;
  checkAt: ReturnType<typeof vi.fn>;
} {
  return {
    sendInput: vi.fn(async () => undefined),
    scroll: vi.fn(async () => undefined),
    sleep: vi.fn(async () => undefined),
    checkAt: vi.fn(async () => ({ onTrack: true })),
    ...over,
  } as never;
}

const steps: ReplayStep[] = compileRecordingToReplay({
  events: [
    { at: "t1", kind: "pointer", type: "click", x: 5, y: 5 },
    { at: "t2", kind: "key", key: "h" },
    { at: "t3", kind: "key", key: "i" },
    { at: "t4", kind: "scroll", type: "down", text: "2" },
    { at: "t5", kind: "snapshot", summary: "the panel is open" },
  ],
  snapshots: [{ at: "t5", summary: "the panel is open", hash: "h5" }],
});

describe("runReplay", () => {
  it("replays every input, passes the checkpoint, and never calls a model", async () => {
    const d = deps();
    const result = await runReplay(steps, d);
    expect(result).toMatchObject({ status: "completed", applied: 3, checkpointsPassed: 1 });
    expect(d.sendInput).toHaveBeenCalledTimes(2); // click + "hi" paste
    expect(d.scroll).toHaveBeenCalledWith("down", 2);
    expect(d.checkAt).toHaveBeenCalledWith({ expect: "the panel is open", snapshotHash: "h5" });
  });

  it("stops at the first drifting checkpoint and reports where", async () => {
    const d = deps({ checkAt: vi.fn(async () => ({ onTrack: false, note: "wrong screen" })) });
    const result = await runReplay(steps, d);
    expect(result.status).toBe("drifted");
    expect(result.note).toBe("wrong screen");
    expect(typeof result.driftAt).toBe("number");
    // The scroll before the checkpoint ran; nothing after it did.
    expect(d.scroll).toHaveBeenCalledOnce();
  });

  it("skips a secret-like typed run and counts it", async () => {
    const secretSteps = compileRecordingToReplay({
      events: "hunter2-token"
        .split("")
        .map((k, i) => ({ at: `t${i}`, kind: "key" as const, key: k })),
    });
    const d = deps();
    const result = await runReplay(secretSteps, d);
    expect(result.skippedSecrets).toBe(1);
    expect(d.sendInput).not.toHaveBeenCalled();
  });

  it("types nothing on a safe test run but still clicks", async () => {
    const d = deps();
    await runReplay(steps, d, { safeTest: true });
    const kinds = d.sendInput.mock.calls.map((c) => (c[0] as { kind: string }).kind);
    expect(kinds).toEqual(["pointer"]);
  });

  it("aborts between steps when the signal trips", async () => {
    const controller = new AbortController();
    const d = deps({
      signal: controller.signal,
      sendInput: vi.fn(async () => controller.abort()),
    });
    const result = await runReplay(steps, d);
    expect(result.status).toBe("aborted");
  });
});
