import {
  BOT_IDENTITY_PATH,
  botIdentityTemplate,
  SOUL_IDENTITY_PATH,
  soulIdentityTemplate,
  USER_IDENTITY_PATH,
  userIdentityTemplate,
} from "@rakazo/core";
import type { Prisma, PrismaClient } from "./client.js";

type IdentityStore = Pick<PrismaClient, "memoryDocument" | "bot"> | Prisma.TransactionClient;

export async function ensureIdentityDocuments(
  prisma: IdentityStore,
  args: {
    workspaceId: string;
    userId: string;
    botId?: string;
    bot?: { name: string; title?: string; description?: string };
  },
): Promise<void> {
  await ensureDocument(prisma, {
    workspaceId: args.workspaceId,
    userId: args.userId,
    scope: "user",
    path: USER_IDENTITY_PATH,
    content: userIdentityTemplate(),
  });
  if (!args.botId) return;

  const bot =
    args.bot ??
    (await prisma.bot.findFirst({
      where: { id: args.botId, workspaceId: args.workspaceId, userId: args.userId },
      select: { name: true, title: true, description: true },
    })) ??
    undefined;
  if (!bot) return;
  await ensureDocument(prisma, {
    workspaceId: args.workspaceId,
    userId: args.userId,
    botId: args.botId,
    scope: "bot",
    path: BOT_IDENTITY_PATH,
    content: botIdentityTemplate(bot),
  });
  await ensureDocument(prisma, {
    workspaceId: args.workspaceId,
    userId: args.userId,
    botId: args.botId,
    scope: "bot",
    path: SOUL_IDENTITY_PATH,
    content: soulIdentityTemplate(),
  });
}

async function ensureDocument(
  prisma: IdentityStore,
  data: {
    workspaceId: string;
    userId: string;
    botId?: string;
    scope: "bot" | "user";
    path: string;
    content: string;
  },
): Promise<void> {
  const existing = await prisma.memoryDocument.findFirst({
    where: {
      workspaceId: data.workspaceId,
      userId: data.userId,
      scope: data.scope,
      path: data.path,
      botId: data.botId ?? null,
    },
    select: { id: true },
  });
  if (existing) return;
  try {
    await prisma.memoryDocument.create({
      data: {
        workspaceId: data.workspaceId,
        userId: data.userId,
        botId: data.botId,
        scope: data.scope,
        path: data.path,
        content: data.content,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) return;
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}
