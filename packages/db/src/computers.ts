import type { ComputerMode } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";

export type { ComputerMode } from "@rakazo/contracts";

export function parseComputerMode(scope: string): ComputerMode {
  if (scope === "team" || scope === "dedicated") return scope;
  throw new Error(`Unknown computer scope: ${scope}`);
}

export function computerScopeKey(mode: ComputerMode, workspaceId: string, botId?: string) {
  if (mode === "team") return `team:${workspaceId}`;
  if (!botId) throw new Error("Dedicated computers require a bot id");
  return `bot:${botId}`;
}

export function computerHomeKey(mode: ComputerMode, workspaceId: string, botId?: string) {
  if (mode === "team") return `team-${workspaceId}`;
  if (!botId) throw new Error("Dedicated computers require a bot id");
  return botId;
}

type ComputerDb = Pick<PrismaClient, "computer">;

/**
 * The one workspace-shared team computer. Grouped bots all run on this, and the
 * group thread's Computer panel drives it. Idempotent: returns the same row that
 * `createRepos().createBot` first creates for the workspace.
 */
export async function ensureTeamComputer(
  prisma: ComputerDb,
  input: { workspaceId: string; userId: string; kind: string },
) {
  return ensureComputerRecord(prisma, {
    mode: "team",
    workspaceId: input.workspaceId,
    userId: input.userId,
    kind: input.kind,
  });
}

export async function ensureComputerRecord(
  prisma: ComputerDb,
  input: {
    mode: ComputerMode;
    workspaceId: string;
    userId: string;
    botId?: string;
    kind: string;
  },
) {
  const scopeKey = computerScopeKey(input.mode, input.workspaceId, input.botId);
  return prisma.computer.upsert({
    where: { scopeKey },
    create: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      scope: input.mode,
      scopeKey,
      homeKey: computerHomeKey(input.mode, input.workspaceId, input.botId),
      kind: input.kind,
    },
    update: {},
  });
}
