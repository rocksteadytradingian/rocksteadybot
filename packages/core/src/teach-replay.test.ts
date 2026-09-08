import { describe, expect, it } from "vitest";
import type { TeachRecordingEvent } from "./teach-playbook.js";
import { compileRecordingToReplay, replayInputCount } from "./teach-replay.js";

const at = (n: number) => new Date(1000 + n).toISOString();

describe("compileRecordingToReplay", () => {
  it("coalesces a typed run into one paste and settles after it", () => {
    const events: TeachRecordingEvent[] = [
      { at: at(1), kind: "key", key: "h" },
      { at: at(2), kind: "key", key: "i" },
      { at: at(3), kind: "key", key: "Enter" },
    ];
    expect(compileRecordingToReplay({ events })).toEqual([
      { kind: "input", input: { kind: "clipboard", text: "hi" }, secretLike: false },
      { kind: "settle", ms: 150 },
      { kind: "input", input: { kind: "key", key: "Return" } },
      { kind: "settle", ms: 150 },
    ]);
  });

  it("reconstructs a click from down/up in place and a drag from down/move/up", () => {
    const click = compileRecordingToReplay({
      events: [
        { at: at(1), kind: "pointer", type: "down", x: 10, y: 10 },
        { at: at(2), kind: "pointer", type: "up", x: 12, y: 11 },
      ],
    });
    expect(click[0]).toEqual({
      kind: "input",
      input: { kind: "pointer", type: "click", x: 10, y: 10, button: "left" },
    });

    const drag = compileRecordingToReplay({
      events: [
        { at: at(1), kind: "pointer", type: "down", x: 10, y: 10 },
        { at: at(2), kind: "pointer", type: "move", x: 60, y: 40 },
        { at: at(3), kind: "pointer", type: "up", x: 60, y: 40 },
      ],
    });
    expect(
      drag
        .filter((s) => s.kind === "input")
        .map((s) => (s as { input: { type: string } }).input.type),
    ).toEqual(["down", "move", "up"]);
  });

  it("flags a secret-like typed run", () => {
    const [step] = compileRecordingToReplay({
      events: [
        ..."my-secret-token".split("").map((k, i) => ({ at: at(i), kind: "key" as const, key: k })),
      ],
    });
    expect(step).toMatchObject({ secretLike: true });
  });

  it("turns snapshot events into checkpoints with their hash", () => {
    const events: TeachRecordingEvent[] = [
      { at: at(1), kind: "pointer", type: "click", x: 5, y: 5 },
      { at: at(2), kind: "snapshot", summary: "the export dialog is open" },
    ];
    const steps = compileRecordingToReplay({
      events,
      snapshots: [{ at: at(2), summary: "the export dialog is open", hash: "abc123" }],
    });
    expect(steps.at(-1)).toEqual({
      kind: "checkpoint",
      expect: "the export dialog is open",
      snapshotHash: "abc123",
    });
  });

  it("appends a final checkpoint from the last snapshot", () => {
    const steps = compileRecordingToReplay({
      events: [{ at: at(1), kind: "scroll", type: "down", text: "5" }],
      snapshots: [{ at: at(9), summary: "the report finished rendering", hash: "z9" }],
    });
    expect(steps).toEqual([
      { kind: "scroll", direction: "down", amount: 5 },
      { kind: "settle", ms: 150 },
      { kind: "checkpoint", expect: "the report finished rendering", snapshotHash: "z9" },
    ]);
  });

  it("counts only the inputs that reach the sandbox", () => {
    const steps = compileRecordingToReplay({
      events: [
        { at: at(1), kind: "key", key: "a" },
        { at: at(2), kind: "pointer", type: "click", x: 1, y: 1 },
        { at: at(3), kind: "scroll", type: "up", text: "2" },
        { at: at(4), kind: "snapshot", summary: "done" },
      ],
    });
    expect(replayInputCount(steps)).toBe(3);
  });

  it("compiles a browser recording into browser steps and a checkpoint", () => {
    const steps = compileRecordingToReplay({
      events: [
        { at: at(1), kind: "browser", action: "navigate", url: "https://shop.test", hash: "h1" },
        { at: at(2), kind: "browser", action: "click", ref: "e3", name: "Cart", hash: "h2" },
        {
          at: at(3),
          kind: "browser",
          action: "type",
          ref: "e5",
          name: "Coupon",
          text: "SAVE10",
          submit: true,
          hash: "h3",
        },
        { at: at(4), kind: "browser", action: "select", ref: "e7", values: ["L"], hash: "h4" },
        { at: at(5), kind: "browser", action: "checkpoint", summary: "discount shown", hash: "h5" },
      ],
    });
    expect(steps).toEqual([
      { kind: "browser", op: "navigate", url: "https://shop.test" },
      { kind: "settle", ms: 150 },
      { kind: "browser", op: "click", ref: "e3" },
      { kind: "settle", ms: 150 },
      { kind: "browser", op: "type", ref: "e5", text: "SAVE10", submit: true, secretLike: false },
      { kind: "settle", ms: 150 },
      { kind: "browser", op: "select", ref: "e7", values: ["L"] },
      { kind: "settle", ms: 150 },
      { kind: "checkpoint", expect: "discount shown", snapshotHash: "h5" },
    ]);
    expect(replayInputCount(steps)).toBe(4);
  });

  it("flags a redacted browser type step as secret-like", () => {
    const steps = compileRecordingToReplay({
      events: [
        {
          at: at(1),
          kind: "browser",
          action: "type",
          ref: "e1",
          text: "[redacted input]",
          hash: "h",
        },
      ],
    });
    expect(steps[0]).toMatchObject({ kind: "browser", op: "type", secretLike: true });
  });
});
