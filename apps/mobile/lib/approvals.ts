import type { PendingApproval } from "@rakazo/contracts";
import { rpc } from "./api";

export function fetchPendingApprovals() {
  return rpc<PendingApproval[]>("approvals/list");
}

export function formatRequestedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function approvalThreadParams(item: PendingApproval) {
  if (item.groupId) {
    return {
      pathname: "/group-thread" as const,
      params: { groupId: item.groupId, name: item.groupName ?? "Group" },
    };
  }
  return {
    pathname: "/thread" as const,
    params: { botId: item.botId, name: item.botName },
  };
}
