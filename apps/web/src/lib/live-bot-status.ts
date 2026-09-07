import type { RunStatus } from "@rakazo/contracts";
import { isActive, isWorking } from "@rakazo/core";

export function isComputerBusyForThread(input: {
  controlHolder?: string | null;
  busyBotName?: string | null;
  threadBotName?: string | null;
  memberNames?: readonly string[];
}): boolean {
  if (input.controlHolder !== "bot" || !input.busyBotName) return false;
  if (input.memberNames?.includes(input.busyBotName)) return true;
  return Boolean(input.threadBotName && input.busyBotName === input.threadBotName);
}

export function liveStatusForBot(input: {
  botId: string;
  botName: string;
  listedStatus: string;
  runs: Array<{ botId: string; status: string }>;
  activeBotId?: string;
  busyBotName?: string | null;
  controlHolder?: string | null;
}): string {
  const ownRun = input.runs.find((run) => run.botId === input.botId);
  if (ownRun && isActive(ownRun.status as RunStatus)) return ownRun.status;
  if (input.botId === input.activeBotId) {
    const working = input.runs.find((run) => isWorking(run.status));
    if (working) return working.status;
  }
  if (input.controlHolder === "bot" && input.busyBotName === input.botName) {
    return "running";
  }
  return input.listedStatus;
}
