import { describe, expect, it, vi } from "vitest";
import {
  confirmBrowserSignIn,
  forgetBrowserSignIn,
  missingBrowserSignIns,
  readBrowserSignIns,
} from "./browser-sign-ins.js";
import type { PrismaClient } from "./client.js";

function prismaWith(browserProfile: Record<string, ReturnType<typeof vi.fn>>) {
  return { browserProfile } as unknown as PrismaClient;
}

describe("readBrowserSignIns", () => {
  it("parses stored entries and drops malformed ones", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      signedInOrigins: [
        { origin: "https://a.test", confirmedAt: "2026-09-08T00:00:00.000Z" },
        { nope: true },
        "garbage",
      ],
    });
    expect(await readBrowserSignIns(prismaWith({ findUnique }), "bot-1")).toEqual([
      { origin: "https://a.test", confirmedAt: "2026-09-08T00:00:00.000Z" },
    ]);
  });

  it("is empty when there is no profile row", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    expect(await readBrowserSignIns(prismaWith({ findUnique }), "bot-1")).toEqual([]);
  });
});

describe("confirmBrowserSignIn", () => {
  it("normalizes the origin, replaces any prior entry, and upserts", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      signedInOrigins: [{ origin: "https://a.test", confirmedAt: "old" }],
    });
    const upsert = vi.fn().mockResolvedValue({});
    const next = await confirmBrowserSignIn(prismaWith({ findUnique, upsert }), {
      workspaceId: "ws",
      botId: "bot-1",
      userId: "u",
      origin: "https://a.test/inbox?x=1",
    });
    expect(next.map((entry) => entry.origin)).toEqual(["https://a.test"]);
    expect(next[0]?.confirmedAt).not.toBe("old");
    expect(upsert).toHaveBeenCalledOnce();
  });
});

describe("forgetBrowserSignIn / missingBrowserSignIns", () => {
  it("removes an origin and reports which requested origins are unconfirmed", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      signedInOrigins: [
        { origin: "https://a.test", confirmedAt: "t" },
        { origin: "https://b.test", confirmedAt: "t" },
      ],
    });
    const update = vi.fn().mockResolvedValue({});
    const prisma = prismaWith({ findUnique, update });

    expect(await forgetBrowserSignIn(prisma, "bot-1", "https://a.test")).toEqual([
      { origin: "https://b.test", confirmedAt: "t" },
    ]);
    expect(update).toHaveBeenCalledWith({
      where: { botId: "bot-1" },
      data: { signedInOrigins: [{ origin: "https://b.test", confirmedAt: "t" }] },
    });
    // The mock still reports both a and b confirmed, so only an unlisted origin is "missing".
    expect(
      await missingBrowserSignIns(prisma, "bot-1", ["https://a.test", "https://c.test"]),
    ).toEqual(["https://c.test"]);
    expect(await missingBrowserSignIns(prisma, "bot-1", [])).toEqual([]);
  });
});
