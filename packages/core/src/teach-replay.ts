import type { TeachRecordingEvent, TeachSnapshot } from "./teach-playbook.js";
import { computerInputForDomKey } from "./teach-recording.js";

/** One input the sandbox can apply verbatim. Mirrors adapter-kit's ComputerInput. */
export type ReplayInput =
  | { kind: "key"; key: string; modifiers?: string[] }
  | {
      kind: "pointer";
      x: number;
      y: number;
      button?: "left" | "right";
      type: "move" | "down" | "up" | "click";
    }
  | { kind: "clipboard"; text: string };

export type ReplayStep =
  /** Apply a recorded input verbatim. `secretLike` marks a typed run the runner should not
   *  replay blindly (pause for the user, or skip on a safe test run). */
  | { kind: "input"; input: ReplayInput; secretLike?: boolean }
  | { kind: "scroll"; direction: "up" | "down"; amount: number }
  /** Let the previous action land before the next one. */
  | { kind: "settle"; ms: number }
  /** Confirm the screen matches the demo here; on drift the runner hands off to the model. */
  | { kind: "checkpoint"; expect: string; snapshotHash?: string };

export const REPLAY_SETTLE_MS = 150;
const DRAG_THRESHOLD_PX = 8;
const SECRET_LIKE = /password|passwd|secret|token|api[_-]?key|otp|2fa/i;

export interface TeachReplayRecording {
  events: TeachRecordingEvent[];
  snapshots?: TeachSnapshot[];
}

/**
 * Compile a recorded demonstration into a deterministic replay: the exact recorded inputs,
 * with checkpoints at the snapshots the user captured. Typed keystrokes are coalesced into
 * one paste per run and drags are reconstructed from down/move/up, matching how
 * `buildPlaybookFromRecording` reads the same stream.
 */
export function compileRecordingToReplay(recording: TeachReplayRecording): ReplayStep[] {
  const snapshotByAt = new Map((recording.snapshots ?? []).map((s) => [s.at, s]));
  const steps: ReplayStep[] = [];

  let typed = "";
  let drag: {
    button: "left" | "right";
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
  } | null = null;

  const push = (step: ReplayStep) => steps.push(step);
  const settle = () => push({ kind: "settle", ms: REPLAY_SETTLE_MS });

  const flushTyped = () => {
    if (!typed) return;
    push({
      kind: "input",
      input: { kind: "clipboard", text: typed },
      secretLike: SECRET_LIKE.test(typed),
    });
    settle();
    typed = "";
  };

  const flushDrag = () => {
    if (!drag) return;
    const moved = Math.hypot(drag.toX - drag.fromX, drag.toY - drag.fromY) >= DRAG_THRESHOLD_PX;
    if (moved) {
      push({
        kind: "input",
        input: { kind: "pointer", type: "down", x: drag.fromX, y: drag.fromY, button: drag.button },
      });
      push({
        kind: "input",
        input: { kind: "pointer", type: "move", x: drag.toX, y: drag.toY, button: drag.button },
      });
      push({
        kind: "input",
        input: { kind: "pointer", type: "up", x: drag.toX, y: drag.toY, button: drag.button },
      });
    } else {
      push({
        kind: "input",
        input: {
          kind: "pointer",
          type: "click",
          x: drag.fromX,
          y: drag.fromY,
          button: drag.button,
        },
      });
    }
    settle();
    drag = null;
  };

  for (const event of recording.events) {
    if (event.kind === "key") {
      if (!event.key) continue;
      flushDrag();
      if (event.key.length === 1) {
        typed += event.key;
        continue;
      }
      flushTyped();
      const input = computerInputForDomKey(event.key);
      push({ kind: "input", input });
      settle();
      continue;
    }

    flushTyped();

    if (event.kind === "pointer") {
      const type = (event.type ?? "click") as "move" | "down" | "up" | "click";
      const button = event.button === "right" ? "right" : "left";
      const x = event.x ?? 0;
      const y = event.y ?? 0;
      if (type === "down") {
        flushDrag();
        drag = { button, fromX: x, fromY: y, toX: x, toY: y };
      } else if (type === "move" && drag) {
        drag.toX = x;
        drag.toY = y;
      } else if (type === "up" && drag) {
        drag.toX = x;
        drag.toY = y;
        flushDrag();
      } else {
        flushDrag();
        push({ kind: "input", input: { kind: "pointer", type, x, y, button } });
        settle();
      }
      continue;
    }

    if (event.kind === "clipboard") {
      if (!event.text) continue;
      push({
        kind: "input",
        input: { kind: "clipboard", text: event.text },
        secretLike: SECRET_LIKE.test(event.text),
      });
      settle();
      continue;
    }

    if (event.kind === "scroll") {
      const direction = event.type === "up" ? "up" : "down";
      const amount = clampAmount(Number(event.text ?? 3));
      push({ kind: "scroll", direction, amount });
      settle();
      continue;
    }

    if (event.kind === "snapshot") {
      const snap = snapshotByAt.get(event.at);
      push({
        kind: "checkpoint",
        expect: event.summary ?? snap?.summary ?? "the screen matches the demo at this point",
        snapshotHash: snap?.hash,
      });
    }
  }

  flushTyped();
  flushDrag();

  const last = recording.snapshots?.at(-1);
  if (last && steps.at(-1)?.kind !== "checkpoint") {
    push({ kind: "checkpoint", expect: last.summary, snapshotHash: last.hash });
  }
  return steps;
}

function clampAmount(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(Math.max(Math.round(value), 1), 20);
}

/** Count the inputs a replay will actually send — the metric for "did it run without the model". */
export function replayInputCount(steps: readonly ReplayStep[]): number {
  return steps.filter((step) => step.kind === "input" || step.kind === "scroll").length;
}
