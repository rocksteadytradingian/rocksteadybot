import * as z from "zod";
import { Id, RunStatus } from "./ids.js";
import { OutcomeRollupSchema } from "./outcomes.js";

export const RunActivityRowSchema = z.object({
  runId: Id,
  botId: Id,
  botName: z.string(),
  groupId: Id.nullable(),
  groupName: z.string().nullable(),
  threadId: Id,
  status: RunStatus,
  trigger: z.enum(["user", "routine", "resume", "follow_up", "spawn", "skill", "bot_message"]),
  promptSnippet: z.string(),
  updatedAt: z.string(),
  /** How independent verification of the run's declared outcomes went; null when it declared none. */
  outcomeStatus: OutcomeRollupSchema.nullable(),
});
export type RunActivityRow = z.infer<typeof RunActivityRowSchema>;

export const RunsListOutputSchema = z.object({
  runs: z.array(RunActivityRowSchema),
});
export type RunsListOutput = z.infer<typeof RunsListOutputSchema>;
