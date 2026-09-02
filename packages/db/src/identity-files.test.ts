import { BOT_IDENTITY_PATH, SOUL_IDENTITY_PATH, USER_IDENTITY_PATH } from "@rakazo/core";
import { describe, expect, it, vi } from "vitest";
import { ensureIdentityDocuments } from "./identity-files.js";

describe("ensureIdentityDocuments", () => {
  it("creates USER.md for the account and bot identity files when a bot is given", async () => {
    const create = vi.fn();
    const findFirst = vi.fn(async () => null);
    const prisma = {
      memoryDocument: { findFirst, create },
      bot: { findFirst: vi.fn() },
    };

    await ensureIdentityDocuments(prisma as never, {
      workspaceId: "ws-1",
      userId: "user-1",
      botId: "bot-1",
      bot: { name: "Kai", title: "Advisor" },
    });

    expect(create).toHaveBeenCalledTimes(3);
    expect(
      create.mock.calls.map((call) => (call[0] as { data: { path: string } }).data.path),
    ).toEqual([USER_IDENTITY_PATH, BOT_IDENTITY_PATH, SOUL_IDENTITY_PATH]);
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ content: expect.stringContaining("# Kai") }),
      }),
    );
    expect(prisma.bot.findFirst).not.toHaveBeenCalled();
  });

  it("skips files that already exist", async () => {
    const create = vi.fn();
    const prisma = {
      memoryDocument: {
        findFirst: vi.fn(async () => ({ id: "existing" })),
        create,
      },
      bot: { findFirst: vi.fn() },
    };

    await ensureIdentityDocuments(prisma as never, {
      workspaceId: "ws-1",
      userId: "user-1",
    });

    expect(create).not.toHaveBeenCalled();
  });

  it("skips bot files when the bot cannot be found", async () => {
    const create = vi.fn();
    const prisma = {
      memoryDocument: {
        findFirst: vi.fn(async () => null),
        create,
      },
      bot: { findFirst: vi.fn(async () => null) },
    };

    await ensureIdentityDocuments(prisma as never, {
      workspaceId: "ws-1",
      userId: "user-1",
      botId: "missing",
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ path: USER_IDENTITY_PATH }),
      }),
    );
  });
});
