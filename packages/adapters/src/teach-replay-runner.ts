import type { ReplayInput, ReplayStep } from "@rakazo/core";

/** Everything the runner needs from the outside — all sandbox work is injected. */
export interface ReplayRunnerDeps {
  sendInput(input: ReplayInput): Promise<void>;
  scroll(direction: "up" | "down", amount: number): Promise<void>;
  sleep(ms: number): Promise<void>;
  /**
   * Decide whether the live screen still matches the demo at a checkpoint. Return `onTrack:
   * false` to stop the replay and hand back to the model. Implementations compare a snapshot
   * hash, run OCR, or ask a model — the runner does not care which.
   */
  checkAt(step: {
    expect: string;
    snapshotHash?: string;
  }): Promise<{ onTrack: boolean; note?: string }>;
  /**
   * Apply one recorded browser action against a live browser session. Present only for a
   * browser-surface replay; `ok: false` stops the replay and hands back to the model.
   */
  browserStep?(step: {
    op: "navigate" | "click" | "type" | "select";
    url?: string;
    ref?: string;
    text?: string;
    submit?: boolean;
    values?: string[];
  }): Promise<{ ok: boolean; note?: string }>;
  signal?: AbortSignal;
}

export interface ReplayRunResult {
  status: "completed" | "drifted" | "aborted";
  /** Inputs (and scrolls) actually sent to the sandbox. */
  applied: number;
  checkpointsPassed: number;
  /** Step index where a checkpoint failed, when `status === "drifted"`. */
  driftAt?: number;
  note?: string;
  /** Secret-like typed runs that were not replayed. */
  skippedSecrets: number;
}

export interface ReplayRunOptions {
  /** A safe test run never types anything, so a demo can be dry-run without side effects. */
  safeTest?: boolean;
}

/**
 * Replay compiled {@link ReplayStep}s against a sandbox. Sends the recorded inputs verbatim
 * and only stops early when a checkpoint reports drift (or the run is aborted) — the model is
 * never in the loop here. Secret-like typed runs are skipped, and on a safe test run nothing
 * is typed at all.
 */
export async function runReplay(
  steps: readonly ReplayStep[],
  deps: ReplayRunnerDeps,
  options: ReplayRunOptions = {},
): Promise<ReplayRunResult> {
  let applied = 0;
  let checkpointsPassed = 0;
  let skippedSecrets = 0;

  for (let i = 0; i < steps.length; i += 1) {
    if (deps.signal?.aborted) {
      return { status: "aborted", applied, checkpointsPassed, skippedSecrets };
    }
    const step = steps[i] as ReplayStep;

    if (step.kind === "settle") {
      await deps.sleep(step.ms);
      continue;
    }

    if (step.kind === "checkpoint") {
      const verdict = await deps.checkAt({ expect: step.expect, snapshotHash: step.snapshotHash });
      if (!verdict.onTrack) {
        return {
          status: "drifted",
          applied,
          checkpointsPassed,
          driftAt: i,
          note: verdict.note ?? step.expect,
          skippedSecrets,
        };
      }
      checkpointsPassed += 1;
      continue;
    }

    if (step.kind === "scroll") {
      await deps.scroll(step.direction, step.amount);
      applied += 1;
      continue;
    }

    if (step.kind === "browser") {
      if (step.secretLike || (options.safeTest && step.op === "type")) {
        if (step.secretLike) skippedSecrets += 1;
        continue;
      }
      const outcome = (await deps.browserStep?.(step)) ?? {
        ok: false,
        note: "no browser session for this replay",
      };
      if (!outcome.ok) {
        return {
          status: "drifted",
          applied,
          checkpointsPassed,
          driftAt: i,
          note: outcome.note ?? `browser ${step.op} failed`,
          skippedSecrets,
        };
      }
      applied += 1;
      continue;
    }

    // step.kind === "input"
    const typing = step.input.kind === "clipboard" || step.input.kind === "key";
    if (step.secretLike || (options.safeTest && typing)) {
      if (step.secretLike) skippedSecrets += 1;
      continue;
    }
    await deps.sendInput(step.input);
    applied += 1;
  }

  return { status: "completed", applied, checkpointsPassed, skippedSecrets };
}
