import type { PrismaClient } from "@rakazo/db";
import { verifyPassword } from "better-auth/crypto";
import { describe, expect, it, vi } from "vitest";
import {
  normalizeAccountEmail,
  parseSetPasswordArgs,
  setCredentialPassword,
} from "./set-password.js";

describe("parseSetPasswordArgs", () => {
  it("reads email and password flags", () => {
    expect(
      parseSetPasswordArgs(["--email", "Ada@example.com", "--password", "new-password-12"]),
    ).toEqual({ email: "Ada@example.com", password: "new-password-12" });
  });

  it("rejects missing flags", () => {
    expect(() => parseSetPasswordArgs(["--email", "ada@example.com"])).toThrow(/Usage/);
    expect(() => parseSetPasswordArgs([])).toThrow(/Usage/);
  });
});

describe("setCredentialPassword", () => {
  it("normalizes lookup email", () => {
    expect(normalizeAccountEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("hashes, stores, and revokes sessions for an existing credential account", async () => {
    const update = vi.fn(async () => ({ id: "acc-1" }));
    const deleteMany = vi.fn(async () => ({ count: 2 }));
    const prisma = {
      user: {
        findFirst: vi.fn(async () => ({ id: "user-1" })),
      },
      account: {
        findFirst: vi.fn(async () => ({ id: "acc-1" })),
        update,
        create: vi.fn(),
      },
      session: { deleteMany },
    } as unknown as PrismaClient;

    await expect(
      setCredentialPassword(prisma, "Ada@example.com", "new-password-12"),
    ).resolves.toEqual({ userId: "user-1" });

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "ada@example.com", mode: "insensitive" } },
      select: { id: true },
    });
    expect(update).toHaveBeenCalled();
    const stored = update.mock.calls[0] as unknown as [{ data: { password: string } }];
    const hash = stored[0].data.password;
    expect(hash).toEqual(expect.any(String));
    await expect(verifyPassword({ hash, password: "new-password-12" })).resolves.toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("rejects unknown emails and short passwords", async () => {
    const prisma = {
      user: { findFirst: vi.fn(async () => null) },
      account: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
      session: { deleteMany: vi.fn() },
    } as unknown as PrismaClient;

    await expect(setCredentialPassword(prisma, "missing@example.com", "short")).rejects.toThrow(
      /at least 8/,
    );
    await expect(
      setCredentialPassword(prisma, "missing@example.com", "long-enough"),
    ).rejects.toThrow(/No account/);
  });
});
