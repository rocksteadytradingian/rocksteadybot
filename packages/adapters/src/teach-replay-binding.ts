import type {
  AdapterContext,
  ComputerAction,
  ComputerRef,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import type { ReplayRunnerDeps, ReplayRunResult } from "./teach-replay-runner.js";

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
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        args.context.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      }),
    checkAt: async (step) => {
      const observation = await args.sandbox.observe(args.computer, args.context);
      return strategy.check(
        { frameId: observation.frameId, activeWindowTitle: observation.activeWindow?.title },
        step,
      );
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
