import type {
  AdapterContext,
  BrowserSession,
  ComputerAction,
  ComputerRef,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import type { ReplayRunnerDeps, ReplayRunResult } from "./teach-replay-runner.js";

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export interface ReplayCheckpointStrategy {
  check(
    observed: { frameId: string; activeWindowTitle?: string },
    step: { expect: string; snapshotHash?: string },
  ): Promise<{ onTrack: boolean; note?: string }>;
}

/**
 * Trust the replay unless the demo recorded a snapshot hash for this checkpoint and the live
 * frame's hash differs. No model call — a stronger strategy (OCR, a vision model) can replace it.
 */
export const hashCheckpointStrategy: ReplayCheckpointStrategy = {
  async check(observed, step) {
    if (!step.snapshotHash) return { onTrack: true };
    return observed.frameId === step.snapshotHash
      ? { onTrack: true }
      : {
          onTrack: false,
          note: `the screen no longer matches the demo (expected: ${step.expect})`,
        };
  },
};

/**
 * Wire {@link ReplayRunnerDeps} to a live sandbox. Every input goes through `sandbox.act` —
 * the same path the computer tools use — so no separate control lease is needed.
 */
export function bindReplayRunner(args: {
  sandbox: Pick<SandboxProvider, "act" | "observe">;
  computer: ComputerRef;
  context: AdapterContext;
  checkpoint?: ReplayCheckpointStrategy;
}): ReplayRunnerDeps {
  const strategy = args.checkpoint ?? hashCheckpointStrategy;
  const act = (action: ComputerAction) =>
    args.sandbox.act(args.computer, { actions: [action], settleMs: 0 }, args.context);
  return {
    signal: args.context.signal,
    sendInput: async (input) => {
      await act(input as ComputerAction);
    },
    scroll: async (direction, amount) => {
      await act({ kind: "scroll", direction, amount });
    },
    sleep: (ms) => abortableSleep(ms, args.context.signal),
    checkAt: async (step) => {
      const observation = await args.sandbox.observe(args.computer, args.context);
      return strategy.check(
        { frameId: observation.frameId, activeWindowTitle: observation.activeWindow?.title },
        step,
      );
    },
  };
}

/**
 * Wire {@link ReplayRunnerDeps} to a live browser session for a `browser`-surface replay.
 * Browser recordings never carry raw pointer / key steps, so `sendInput` and `scroll` are
 * unreachable and throw. A checkpoint compares the live page's accessibility-tree hash to the
 * one recorded in the demo; a mismatch drifts the replay back to the model.
 */
export function bindBrowserReplayRunner(args: {
  browser: BrowserSession;
  context: AdapterContext;
}): ReplayRunnerDeps {
  return {
    signal: args.context.signal,
    sendInput: async () => {
      throw new Error("browser replay does not send raw inputs");
    },
    scroll: async () => {
      throw new Error("browser replay does not scroll");
    },
    sleep: (ms) => abortableSleep(ms, args.context.signal),
    browserStep: async (step) => {
      try {
        if (step.op === "navigate") {
          const r = await args.browser.navigate(step.url ?? "");
          return { ok: r.ok, note: r.note };
        }
        if (step.op === "click") {
          const r = await args.browser.click(step.ref ?? "");
          return { ok: r.ok, note: r.note };
        }
        if (step.op === "type") {
          const r = await args.browser.type(step.ref ?? "", step.text ?? "", {
            submit: step.submit,
          });
          return { ok: r.ok, note: r.note };
        }
        const r = await args.browser.select(step.ref ?? "", step.values ?? []);
        return { ok: r.ok, note: r.note };
      } catch (error) {
        return { ok: false, note: error instanceof Error ? error.message : String(error) };
      }
    },
    checkAt: async (step) => {
      if (!step.snapshotHash) return { onTrack: true };
      const snap = await args.browser.snapshot();
      return snap.hash === step.snapshotHash
        ? { onTrack: true }
        : {
            onTrack: false,
            note: `the page no longer matches the demo (expected: ${step.expect})`,
          };
    },
  };
}

/** The prompt fragment that hands a finished or drifted replay back to the model. */
export function replayHandoffPrompt(
  skillName: string,
  goal: string,
  result: ReplayRunResult,
): string {
  const head = `Taught skill "${skillName}" — goal: ${goal}`;
  if (result.status === "completed") {
    const secrets = result.skippedSecrets
      ? `, ${result.skippedSecrets} secret input${result.skippedSecrets === 1 ? "" : "s"} left for you to enter`
      : "";
    return `${head}
A deterministic replay of the recorded steps finished (${result.applied} inputs, ${result.checkpointsPassed} checkpoint${result.checkpointsPassed === 1 ? "" : "s"} passed${secrets}). Verify the screen matches the goal, do anything the recording could not (secrets, dynamic values), and report the result.`;
  }
  if (result.status === "drifted") {
    return `${head}
A deterministic replay ran ${result.applied} recorded inputs, then a checkpoint drifted: ${result.note}. Take over from the current screen and finish the task by hand.`;
  }
  return `${head}
The replay was interrupted after ${result.applied} inputs. Assess the current screen and continue.`;
}
