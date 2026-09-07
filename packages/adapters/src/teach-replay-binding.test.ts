import type { ComputerObservation, ComputerRef } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import {
  bindReplayRunner,
  hashCheckpointStrategy,
  replayHandoffPrompt,
} from "./teach-replay-binding.js";

const computer: ComputerRef = { id: "c1", botId: "b1", kind: "fake", providerRef: "r1" };
const context = {
  operationId: "op",
  traceId: "tr",
  workspaceId: "ws",
  userId: "u",
  signal: new AbortController().signal,
};

function observation(frameId: string): ComputerObservation {
  return {
    frameId,
    capturedAt: "2026-09-07T00:00:00.000Z",
    mimeType: "image/png",
    image: new Uint8Array(),
    width: 1,
    height: 1,
    activeWindow: { id: "w", title: "Files" },
  };
}

describe("hashCheckpointStrategy", () => {
  it("passes with no recorded hash, and compares when there is one", async () => {
    expect(await hashCheckpointStrategy.check({ frameId: "x" }, { expect: "e" })).toEqual({
      onTrack: true,
    });
    expect(
      await hashCheckpointStrategy.check(
        { frameId: "same" },
        { expect: "e", snapshotHash: "same" },
      ),
    ).toEqual({ onTrack: true });
    const drift = await hashCheckpointStrategy.check(
      { frameId: "now" },
      { expect: "the panel is open", snapshotHash: "then" },
    );
    expect(drift.onTrack).toBe(false);
    expect(drift.note).toContain("the panel is open");
  });
});

describe("bindReplayRunner", () => {
  it("routes inputs, scrolls and checkpoints through sandbox.act / observe", async () => {
    const sandbox = {
      act: vi.fn(async () => ({ completed: 1 })),
      observe: vi.fn(async () => observation("f1")),
    };
    const deps = bindReplayRunner({ sandbox, computer, context });

    await deps.sendInput({ kind: "pointer", type: "click", x: 3, y: 4, button: "left" });
    expect(sandbox.act).toHaveBeenCalledWith(
      computer,
      { actions: [{ kind: "pointer", type: "click", x: 3, y: 4, button: "left" }], settleMs: 0 },
      context,
    );

    await deps.scroll("down", 3);
    expect(sandbox.act).toHaveBeenLastCalledWith(
      computer,
      { actions: [{ kind: "scroll", direction: "down", amount: 3 }], settleMs: 0 },
      context,
    );

    expect(await deps.checkAt({ expect: "e", snapshotHash: "f1" })).toEqual({ onTrack: true });
  });
});

describe("replayHandoffPrompt", () => {
  it("phrases completion, drift and interruption", () => {
    expect(
      replayHandoffPrompt("Export report", "download the Q3 report", {
        status: "completed",
        applied: 8,
        checkpointsPassed: 2,
        skippedSecrets: 1,
      }),
    ).toMatch(/finished \(8 inputs, 2 checkpoints passed, 1 secret input left/);

    expect(
      replayHandoffPrompt("Export report", "g", {
        status: "drifted",
        applied: 4,
        checkpointsPassed: 1,
        driftAt: 9,
        note: "wrong dialog",
        skippedSecrets: 0,
      }),
    ).toMatch(/checkpoint drifted: wrong dialog\. Take over/);

    expect(
      replayHandoffPrompt("s", "g", {
        status: "aborted",
        applied: 2,
        checkpointsPassed: 0,
        skippedSecrets: 0,
      }),
    ).toMatch(/interrupted after 2 inputs/);
  });
});
