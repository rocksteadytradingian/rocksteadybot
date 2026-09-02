import * as z from "zod";
import { Id, RunStatus } from "./ids.js";

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
});
export type RunActivityRow = z.infer<typeof RunActivityRowSchema>;

export const RunsListOutputSchema = z.object({
  runs: z.array(RunActivityRowSchema),
});
export type RunsListOutput = z.infer<typeof RunsListOutputSchema>;

export const PendingApprovalSchema = z.object({
  id: Id,
  runId: Id,
  messageId: Id,
  threadId: Id,
  botId: Id,
  botName: z.string(),
  groupId: Id.nullable(),
  groupName: z.string().nullable(),
  summary: z.string(),
  detail: z.string().optional(),
  toolName: z.string(),
  highRisk: z.boolean(),
  requestedAt: z.string(),
});
export type PendingApproval = z.infer<typeof PendingApprovalSchema>;
