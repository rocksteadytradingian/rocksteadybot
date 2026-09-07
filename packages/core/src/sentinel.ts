/**
 * A sentinel watches a condition on a schedule and acts only on a *transition*, not on every
 * tick — so "check the deploy every 5 minutes but only ping me when it goes red" is one
 * sentinel, not a routine that spams. The schedule is just how often the condition is
 * sampled; this module owns the transition logic and the "stays true for a while" timer.
 */

export type SentinelTrigger = "becomes-true" | "changes" | "stays-true-for";

/** One sample of the watched condition. `value` is the thing compared for `changes`. */
export interface SentinelObservation {
  /** The condition is currently met. */
  ok: boolean;
  /** A stable string form of what was observed (status text, a count, a hash…). */
  value: string;
}

/** What the sentinel knew after its previous tick. */
export interface SentinelState {
  ok: boolean;
  value: string;
  /** ISO time the current (value, ok) run started — used by `stays-true-for`. */
  since: string;
}

export interface EvaluateSentinelInput {
  trigger: SentinelTrigger;
  /** For `stays-true-for`: how long `ok` must hold before firing, in ms. */
  windowMs?: number;
  previous?: SentinelState;
  observation: SentinelObservation;
  now: Date;
}

export interface EvaluateSentinelResult {
  fire: boolean;
  /** Persist this as the sentinel's state for the next tick. */
  nextState: SentinelState;
  /** When set, schedule one extra check at this time (a `stays-true-for` that isn't ripe yet). */
  armFollowUpAt?: Date;
}

export function evaluateSentinel(input: EvaluateSentinelInput): EvaluateSentinelResult {
  const { trigger, previous, observation, now } = input;
  const nowIso = now.toISOString();

  // `since` resets whenever the (ok, value) pair changes.
  const runContinues =
    previous !== undefined &&
    previous.ok === observation.ok &&
    previous.value === observation.value;
  const since = runContinues ? previous.since : nowIso;
  const nextState: SentinelState = { ok: observation.ok, value: observation.value, since };

  if (trigger === "becomes-true") {
    return { fire: observation.ok && previous?.ok !== true, nextState };
  }

  if (trigger === "changes") {
    const fire = previous !== undefined && previous.value !== observation.value;
    return { fire, nextState };
  }

  // stays-true-for
  const windowMs = Math.max(0, input.windowMs ?? 0);
  if (!observation.ok) return { fire: false, nextState };
  const heldForMs = now.getTime() - new Date(since).getTime();
  if (heldForMs >= windowMs) return { fire: true, nextState };
  return { fire: false, nextState, armFollowUpAt: new Date(new Date(since).getTime() + windowMs) };
}

/** Parse `"15m"`, `"2h"`, `"90s"`, `"1d"` to milliseconds. Returns null on a bad string. */
export function parseWindowMs(value: string): number | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const scale =
    unit === "s" ? 1_000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return Math.round(amount * scale);
}
