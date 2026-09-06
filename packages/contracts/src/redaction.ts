import * as z from "zod";

/**
 * Screen scrubbing removes personal / protected data from a computer screenshot (and from the
 * text that travels with it) before it is sent to a model. It is opt-in per workspace and
 * off by default — the core product sends frames unchanged unless a policy turns this on.
 */

/** Entity classes a redactor can look for. Kept small and provider-neutral. */
export const RedactionEntitySchema = z.enum([
  "EMAIL",
  "PHONE",
  "CREDIT_CARD",
  "SSN",
  "PERSON",
  "MRN", // medical record number
  "US_BANK_NUMBER",
  "IP_ADDRESS",
]);
export type RedactionEntity = z.infer<typeof RedactionEntitySchema>;

export const RedactionModeSchema = z.enum(["off", "box-fill", "blur"]);
export type RedactionMode = z.infer<typeof RedactionModeSchema>;

export const RedactionPolicySchema = z.object({
  mode: RedactionModeSchema,
  /** Which entity classes to redact. Empty is legal and means "detect nothing". */
  entities: z.array(RedactionEntitySchema),
  /** Detections below this score are ignored. 0..1. */
  minConfidence: z.number().min(0).max(1),
  /** Literal strings that must never be redacted even if a detector flags them. */
  allowlist: z.array(z.string()).optional(),
});
export type RedactionPolicy = z.infer<typeof RedactionPolicySchema>;

/** A rectangle a redactor blanked, in pixels from the frame's top-left. */
export const RedactionRegionSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  entity: RedactionEntitySchema,
  score: z.number().min(0).max(1),
});
export type RedactionRegion = z.infer<typeof RedactionRegionSchema>;

/** The setting when scrubbing has never been turned on: pass frames straight through. */
export const REDACTION_OFF: RedactionPolicy = {
  mode: "off",
  entities: [],
  minConfidence: 0.6,
};

/** A sensible starting point for a regulated / "Private" workspace. */
export const REGULATED_REDACTION_POLICY: RedactionPolicy = {
  mode: "box-fill",
  entities: ["EMAIL", "PHONE", "CREDIT_CARD", "SSN", "MRN", "US_BANK_NUMBER"],
  minConfidence: 0.6,
};

export function redactionEnabled(policy: RedactionPolicy): boolean {
  return policy.mode !== "off" && policy.entities.length > 0;
}

/** A one-line note for a tool result: `redacted 3 regions (EMAIL, PERSON)`. Empty string when none. */
export function redactionSummary(regions: readonly RedactionRegion[]): string {
  if (regions.length === 0) return "";
  const kinds = [...new Set(regions.map((region) => region.entity))].sort();
  const count = regions.length;
  return `redacted ${count} region${count === 1 ? "" : "s"} (${kinds.join(", ")})`;
}
