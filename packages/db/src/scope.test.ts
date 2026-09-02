import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { IsolationError, requireMembership } from "./scope.js";

function membership(overrides: { organizationId: string; name: string; createdAt?: Date }) {
  return {
    userId: "user-1",
    organizationId: overrides.organizationId,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    user: { email: "ada@rakazo.test" },
    organization: { name: overrides.name },
  };
}

function prismaFor(memberships: ReturnType<typeof membership>[]) {
  return {
    member: {
      findMany: vi.fn(async () => memberships),
    },
    deploymentSettings: {
      findUnique: vi.fn(async () => ({ ownerUserId: "user-1" })),
    },
  } as unknown as PrismaClient;
}

describe("requireMembership", () => {
  it("uses the session's active organization when the user is a member", async () => {
    const prisma = prismaFor([
      membership({ organizationId: "personal", name: "Personal" }),
      membership({ organizationId: "work", name: "Work" }),
    ]);

    await expect(requireMembership(prisma, "user-1", "work")).resolves.toMatchObject({
      userId: "user-1",
      workspaceId: "work",
      email: "ada@rakazo.test",
      isDeploymentOwner: true,
    });
  });

  it("falls back to Personal when the active organization is missing", async () => {
    const prisma = prismaFor([
      membership({ organizationId: "work", name: "Work" }),
      membership({ organizationId: "personal", name: "Personal" }),
    ]);

    await expect(requireMembership(prisma, "user-1", "gone")).resolves.toMatchObject({
      workspaceId: "personal",
    });
  });

  it("uses the oldest membership when Personal is absent", async () => {
    const prisma = prismaFor([
      membership({
        organizationId: "first",
        name: "Alpha",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
      membership({
        organizationId: "second",
        name: "Beta",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      }),
    ]);

    await expect(requireMembership(prisma, "user-1")).resolves.toMatchObject({
      workspaceId: "first",
    });
  });

  it("throws when the user has no workspace", async () => {
    const prisma = prismaFor([]);
    await expect(requireMembership(prisma, "user-1")).rejects.toBeInstanceOf(IsolationError);
  });
});
