import { describe, expect, it, vi } from "vitest";
import { addBotFolder, listBotFolders, removeBotFolder } from "./bot-folders.js";
import type { PrismaClient } from "./client.js";

describe("listBotFolders", () => {
  it("reads one bot's folders oldest first", async () => {
    const findMany = vi.fn(async () => []);
    const prisma = { botFolder: { findMany } } as unknown as PrismaClient;

    await listBotFolders(prisma, "bot-1");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { botId: "bot-1" },
        orderBy: { createdAt: "asc" },
      }),
    );
  });
});

describe("addBotFolder", () => {
  it("upserts on (bot, path) so re-adding only refreshes the label", async () => {
    const upsert = vi.fn(async () => ({}));
    const prisma = { botFolder: { upsert } } as unknown as PrismaClient;

    await addBotFolder(prisma, {
      botId: "bot-1",
      workspaceId: "workspace-1",
      path: "/srv/data",
      label: "Data",
      addedByUserId: "user-1",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { botId_path: { botId: "bot-1", path: "/srv/data" } },
        update: { label: "Data" },
      }),
    );
  });
});

describe("removeBotFolder", () => {
  it("scopes the delete to the bot so an id alone cannot cross bots", async () => {
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const prisma = { botFolder: { deleteMany } } as unknown as PrismaClient;

    await removeBotFolder(prisma, { botId: "bot-1", id: "folder-9" });

    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "folder-9", botId: "bot-1" } });
  });
});
