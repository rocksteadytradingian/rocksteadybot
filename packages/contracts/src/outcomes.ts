import * as z from "zod";
import { Id, IsoDate } from "./ids.js";

/**
 * Outcome verification is independent confirmation that a run's *declared* result actually
 * happened — a file was written, a row landed in a sheet, the page shows the expected text.
 *
 * This is a different axis from the `ExternalEffect` approval machinery (the `effect.recorded`
 * / `effect.reconciled` events and adapters/approval-effect.ts): that gates a single
 * side-effecting tool call *before* it runs and reconciles it after a crash ("is this send
 * allowed?", "did it already happen?"). Outcome verification asks one question once the whole
 * run has finished — "did the stated result occur?" — and never gates anything.
 */

/** A single checkable postcondition a run (or a taught skill / routine) asserts about its result. */
export const OutcomeClaimSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("file-exists"),
    /** Path on the bot's computer / home. */
    path: z.string().min(1),
    /** Fail the check unless the file is at least this many bytes. */
    minBytes: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("text-on-screen"),
    /** Substring or /regex/ the live screen (accessibility tree, else OCR) must contain. */
    pattern: z.string().min(1),
  }),
  z.object({
    kind: z.literal("http-ok"),
    method: z.literal("GET"),
    url: z.string().url(),
    /** Expected status; defaults to any 2xx when omitted. */
    status: z.number().int().min(100).max(599).optional(),
    /** Optional JSONPath-ish selector into the response body. */
    jsonPath: z.string().min(1).optional(),
    /** When `jsonPath` is set, the selected value must stringify to this. */
    equals: z.string().optional(),
  }),
  z.object({
    kind: z.literal("connector-record"),
    /** Connector id whose data proves the effect, e.g. "google-sheets". */
    connector: z.string().min(1),
    /** Provider-neutral query the connector adapter knows how to answer, e.g. "row where A='Q3'". */
    query: z.string().min(1),
  }),
  z.object({
    kind: z.literal("model-judgement"),
    /** Last-resort tier: a yes/no question a model answers from the transcript + final screen. */
    question: z.string().min(1),
  }),
]);
export type OutcomeClaim = z.infer<typeof OutcomeClaimSchema>;
export type OutcomeClaimKind = OutcomeClaim["kind"];

/**
 * How the verdict was reached, strongest first. A verifier tries the highest tier a claim
 * allows and falls back down; the tier is recorded so callers can see how much of the
 * verdict rests on the model's own say-so.
 */
export const VerdictTierSchema = z.enum(["assertion", "ocr", "pixel", "model"]);
export type VerdictTier = z.infer<typeof VerdictTierSchema>;

export const VerdictStatusSchema = z.enum(["verified", "unconfirmed", "contradicted"]);
export type VerdictStatus = z.infer<typeof VerdictStatusSchema>;

export const VerdictSchema = z.object({
  /** The claim this verdict answers, echoed back so a batch result is self-describing. */
  claim: OutcomeClaimSchema,
  status: VerdictStatusSchema,
  tier: VerdictTierSchema,
  checkedAt: IsoDate,
  /** Human-readable proof or reason: "file is 4.2 KB", "no row matched", "HTTP 500". */
  evidence: z.string(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

/** Verdicts attached to a finished run, for storage and for the approvals UI. */
export const RunOutcomeSchema = z.object({
  runId: Id,
  verdicts: z.array(VerdictSchema),
  rolledUp: z.enum(["verified", "needs_review", "contradicted", "unverified"]),
});
export type RunOutcome = z.infer<typeof RunOutcomeSchema>;

export type OutcomeRollup = RunOutcome["rolledUp"];

/**
 * Collapse per-claim verdicts into one run-level outcome:
 * - any `contradicted`      → `contradicted`  (a stated effect provably did not happen)
 * - else any `unconfirmed`  → `needs_review`  (could not confirm; route to a human)
 * - else at least one claim → `verified`
 * - no claims at all        → `unverified`    (nothing was asserted; preserves prior behaviour)
 */
export function rollUpVerdicts(verdicts: readonly Verdict[]): OutcomeRollup {
  if (verdicts.length === 0) return "unverified";
  if (verdicts.some((verdict) => verdict.status === "contradicted")) return "contradicted";
  if (verdicts.some((verdict) => verdict.status === "unconfirmed")) return "needs_review";
  return "verified";
}
