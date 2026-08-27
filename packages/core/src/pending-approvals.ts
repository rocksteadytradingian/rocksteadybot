import { MessageBlock as MessageBlockSchema, type PendingApproval } from "@rakazo/contracts";
import { isApprovalAskBlock, toolRequiresApproval } from "./action-approval.js";

const REVIEW_BEFORE = /^review before\s+/i;

export type PendingApprovalEffect = {
  id: string;
  kind: string;
  createdAt: Date | string;
  run: {
    id: string;
    threadId: string;
    botId: string;
    botName: string;
    groupId: string | null;
    groupName: string | null;
  };
};

export type PendingApprovalMessage = {
  id: string;
  runId: string | null;
  blocks: unknown;
};

export function approvalInboxSummary(text: string, toolName: string): string {
  const stripped = text.trim().replace(REVIEW_BEFORE, "").trim();
  return stripped || toolName;
}

export function collectPendingApprovals(
  effects: readonly PendingApprovalEffect[],
  messages: readonly PendingApprovalMessage[],
): PendingApproval[] {
  const messagesByRun = new Map<string, PendingApprovalMessage[]>();
  for (const message of messages) {
    if (!message.runId) continue;
    const list = messagesByRun.get(message.runId);
    if (list) list.push(message);
    else messagesByRun.set(message.runId, [message]);
  }

  const pending: PendingApproval[] = [];
  for (const effect of effects) {
    const matched = matchPendingAsk(effect.id, messagesByRun.get(effect.run.id) ?? []);
    if (!matched) continue;
    pending.push({
      id: effect.id,
      runId: effect.run.id,
      messageId: matched.messageId,
      threadId: effect.run.threadId,
      botId: effect.run.botId,
      botName: effect.run.botName,
      groupId: effect.run.groupId,
      groupName: effect.run.groupName,
      summary: approvalInboxSummary(matched.text, effect.kind),
      detail: matched.detail,
      toolName: effect.kind,
      highRisk: toolRequiresApproval(effect.kind, true),
      requestedAt: toIso(effect.createdAt),
    });
  }
  return pending;
}

function matchPendingAsk(
  effectId: string,
  messages: readonly PendingApprovalMessage[],
): { messageId: string; text: string; detail?: string } | null {
  for (const message of messages) {
    const parsed = MessageBlockSchema.array().safeParse(message.blocks);
    if (!parsed.success) continue;
    const block = parsed.data.find(
      (candidate) =>
        isApprovalAskBlock(candidate) &&
        candidate.kind === "ask" &&
        candidate.approvalEffectId === effectId &&
        candidate.status !== "answered",
    );
    if (block?.kind !== "ask") continue;
    return {
      messageId: message.id,
      text: block.text,
      detail: block.detail,
    };
  }
  return null;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
