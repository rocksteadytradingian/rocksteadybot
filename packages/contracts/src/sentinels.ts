import * as z from "zod";
import { Id } from "./ids.js";

/**
 * A sentinel is a saved "watch this, act only when it changes" — the wire shape the
 * frontend and tools use. The transition logic and the tick that samples the check live
 * in @rakazo/core (`evaluateSentinel`) and @rakazo/adapters (`runSentinelTick`); this
 * module is only the stored/validated definition.
 */

/** How the watched condition is sampled each tick. */
export const SentinelCheckSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("http-ok"),
    url: z.string().url(),
  }),
  z.object({
    kind: z.literal("text-on-screen"),
    text: z.string().min(1).max(400),
    /** Optional screen id; defaults to the active screen. */
    screen: z.string().min(1).optional(),
  }),
]);
export type SentinelCheck = z.infer<typeof SentinelCheckSchema>;

/** Matches @rakazo/core's `SentinelTrigger` — kept independent so the wire shape does
 * not import runtime logic. */
export const SentinelTriggerSchema = z.enum(["becomes-true", "changes", "stays-true-for"]);
export type SentinelTrigger = z.infer<typeof SentinelTriggerSchema>;

/** What happens on a transition. */
export const SentinelActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("notify"), message: z.string().min(1).max(2_000) }),
  z.object({ kind: z.literal("run"), prompt: z.string().min(1).max(8_000) }),
]);
export type SentinelAction = z.infer<typeof SentinelActionSchema>;

/** A window like `"15m"`, `"2h"`, `"90s"`, `"1d"`. */
export const SentinelWindowSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?\s*(?:s|m|h|d)$/i, "window must look like 15m, 2h, 90s, or 1d");

export const SentinelSpecSchema = z
  .object({
    name: z.string().min(1).max(120),
    check: SentinelCheckSchema,
    trigger: SentinelTriggerSchema,
    /** Required for `stays-true-for`; ignored otherwise. */
    window: SentinelWindowSchema.optional(),
    onFire: SentinelActionSchema,
  })
  .superRefine((input, ctx) => {
    if (input.trigger === "stays-true-for" && !input.window) {
      ctx.addIssue({
        code: "custom",
        message: "stays-true-for needs a window (e.g. 15m)",
        path: ["window"],
      });
    }
  });
export type SentinelSpec = z.infer<typeof SentinelSpecSchema>;

/** The persisted sentinel's last-known transition state (see core `SentinelState`). */
export const SentinelStateSchema = z.object({
  ok: z.boolean(),
  value: z.string(),
  since: z.string().datetime({ offset: true }),
});
export type SentinelState = z.infer<typeof SentinelStateSchema>;

export const StoredSentinelSchema = z.object({
  id: Id,
  workspaceId: Id,
  botId: Id,
  name: z.string(),
  check: SentinelCheckSchema,
  trigger: SentinelTriggerSchema,
  window: SentinelWindowSchema.nullable(),
  onFire: SentinelActionSchema,
  active: z.boolean(),
  state: SentinelStateSchema.nullable(),
  lastCheckedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type StoredSentinel = z.infer<typeof StoredSentinelSchema>;

export const SentinelListOutputSchema = z.object({
  sentinels: z.array(StoredSentinelSchema).max(100),
});
export type SentinelListOutput = z.infer<typeof SentinelListOutputSchema>;
