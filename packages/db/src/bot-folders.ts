import type { PrismaClient } from "./client.js";

export type BotFolderRecord = {
  id: string;
  botId: string;
  path: string;
  label: string;
  addedByUserId: string;
  createdAt: Date;
};

const folderSelect = {
  id: true,
  botId: true,
  path: true,
  label: true,
  addedByUserId: true,
  createdAt: true,
} as const;

export function listBotFolders(
  prisma: Pick<PrismaClient, "botFolder">,
  botId: string,
): Promise<BotFolderRecord[]> {
  return prisma.botFolder.findMany({
    where: { botId },
    orderBy: { createdAt: "asc" },
    select: folderSelect,
  });
}

export function addBotFolder(
  prisma: Pick<PrismaClient, "botFolder">,
  input: {
    botId: string;
    workspaceId: string;
    path: string;
    label: string;
    addedByUserId: string;
  },
): Promise<BotFolderRecord> {
  return prisma.botFolder.upsert({
    where: { botId_path: { botId: input.botId, path: input.path } },
    create: input,
    update: { label: input.label },
    select: folderSelect,
  });
}

export async function removeBotFolder(
  prisma: Pick<PrismaClient, "botFolder">,
  input: { botId: string; id: string },
): Promise<void> {
  await prisma.botFolder.deleteMany({ where: { id: input.id, botId: input.botId } });
}
