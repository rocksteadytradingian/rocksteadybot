import {
  evaluateSentinel,
  type SentinelObservation,
  type SentinelState,
  type SentinelTrigger,
} from "@rakazo/core";

export type SentinelAction =
  | { action: "notify"; message: string }
  | { action: "run"; prompt: string };

export interface SentinelDefinition {
  id: string;
  trigger: SentinelTrigger;
  /** For `stays-true-for`. */
  windowMs?: number;
  onFire: SentinelAction;
  state?: SentinelState;
}

export interface SentinelTickDeps {
  /** Sample the watched condition. May throw — a failed sample is a no-op, not a fire. */
  observe(): Promise<SentinelObservation>;
  /** Store the sentinel's state for the next tick. */
  persistState(state: SentinelState): Promise<void>;
  notify(message: string, observation: SentinelObservation): Promise<void>;
  startRun(prompt: string, observation: SentinelObservation): Promise<void>;
  /** Schedule one extra check (a `stays-true-for` whose window has not elapsed). */
  scheduleFollowUp(at: Date): Promise<void>;
  now?: () => Date;
}

export interface SentinelTickResult {
  fired: boolean;
  observation?: SentinelObservation;
  error?: string;
}

/** Run one sentinel tick: sample, decide, persist, and act on a transition. */
export async function runSentinelTick(
  sentinel: SentinelDefinition,
  deps: SentinelTickDeps,
): Promise<SentinelTickResult> {
  let observation: SentinelObservation;
  try {
    observation = await deps.observe();
  } catch (error) {
    return { fired: false, error: error instanceof Error ? error.message : String(error) };
  }

  const now = deps.now?.() ?? new Date();
  const { fire, nextState, armFollowUpAt } = evaluateSentinel({
    trigger: sentinel.trigger,
    windowMs: sentinel.windowMs,
    previous: sentinel.state,
    observation,
    now,
  });

  await deps.persistState(nextState);
  if (armFollowUpAt) await deps.scheduleFollowUp(armFollowUpAt);

  if (fire) {
    if (sentinel.onFire.action === "notify") {
      await deps.notify(sentinel.onFire.message, observation);
    } else {
      await deps.startRun(sentinel.onFire.prompt, observation);
    }
  }

  return { fired: fire, observation };
}
