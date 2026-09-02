import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { IsolationError } from "./scope.js";
import {
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  renameWorkspace,
  setActiveWorkspace,
  type WorkspaceError,
} from "./workspaces.js";

describe("listWorkspaces", () => {
  it("returns memberships in creation order", async () => {
    const prisma = {
      member: {
        findMany: vi.fn(async () => [
          { organization: { id: "personal", name: "Personal" } },
          { organization: { id: "work", name: "Work" } },
        ]),
      },
    } as unknown as PrismaClient;

    await expect(listWorkspaces(prisma, "user-1")).resolves.toEqual([
      { id: "personal", name: "Personal" },
      { id: "work", name: "Work" },
    ]);
    expect(prisma.member.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  });
});

describe("setActiveWorkspace", () => {
  it("rejects a workspace the user does not belong to", async () => {
    const prisma = {
      member: { findUnique: vi.fn(async () => null) },
      session: { updateMany: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      setActiveWorkspace(prisma, { userId: "user-1", workspaceId: "other" }),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(prisma.session.updateMany).not.toHaveBeenCalled();
  });

  it("stores the active organization on the current session", async () => {
    const prisma = {
      member: { findUnique: vi.fn(async () => ({ id: "member-1" })) },
      session: { updateMany: vi.fn(async () => ({ count: 1 })) },
    } as unknown as PrismaClient;

    await setActiveWorkspace(prisma, {
      userId: "user-1",
      workspaceId: "work",
      sessionId: "session-1",
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: "session-1", userId: "user-1" },
      data: { activeOrganizationId: "work" },
    });
  });
});

describe("createWorkspace", () => {
  it("provisions membership, memory, and copied model credentials", async () => {
    const modelCreate = vi.fn();
    const secretCreate = vi.fn();
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
        callback({
          organization: { create: vi.fn() },
          member: { create: vi.fn() },
          memoryDocument: { create: vi.fn(), findFirst: vi.fn(async () => null) },
          bot: { findFirst: vi.fn() },
          notificationPreference: { create: vi.fn() },
          userModelCredential: {
            findMany: vi.fn(async () => [
              {
                secretId: "secret-1",
                provider: "openrouter",
                label: "OpenRouter",
                isDefault: true,
                defaultModel: "test/model",
              },
            ]),
            create: modelCreate,
          },
          userVoiceCredential: {
            findMany: vi.fn(async () => []),
            create: vi.fn(),
          },
          secret: {
            create: secretCreate,
          },
        }),
      ),
    } as unknown as PrismaClient;

    const created = await createWorkspace(prisma, {
      userId: "user-1",
      name: "  Work  ",
      sourceWorkspaceId: "personal",
    });
    expect(created.name).toBe("Work");
    expect(created.id).toMatch(/^[a-f0-9]{32}$/);
    expect(secretCreate).not.toHaveBeenCalled();
    expect(modelCreate).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        workspaceId: created.id,
        provider: "openrouter",
        label: "OpenRouter",
        secretId: "secret-1",
        isDefault: true,
        defaultModel: "test/model",
      },
    });
  });
});

describe("renameWorkspace", () => {
  it("rejects non-members", async () => {
    const prisma = {
      member: { findUnique: vi.fn(async () => null) },
      organization: { update: vi.fn() },
    } as unknown as PrismaClient;
    await expect(
      renameWorkspace(prisma, { userId: "user-1", workspaceId: "work", name: "Studio" }),
    ).rejects.toBeInstanceOf(IsolationError);
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });
});

describe("deleteWorkspace", () => {
  it("refuses to delete the last workspace", async () => {
    const prisma = {
      member: {
        findUnique: vi.fn(async () => ({ role: "owner" })),
        findMany: vi.fn(async () => [{ organization: { id: "personal", name: "Personal" } }]),
      },
    } as unknown as PrismaClient;
    await expect(
      deleteWorkspace(prisma, {
        userId: "user-1",
        workspaceId: "personal",
        currentWorkspaceId: "personal",
      }),
    ).rejects.toMatchObject({
      name: "WorkspaceError",
      code: "last_workspace",
    } satisfies Partial<WorkspaceError>);
  });

  it("does not delete a model secret still used by another workspace", async () => {
    const secretDeleteMany = vi.fn(async () => ({ count: 0 }));
    const prisma = {
      member: {
        findUnique: vi.fn(async () => ({ role: "owner" })),
        findMany: vi.fn(async () => [
          { organization: { id: "personal", name: "Personal" } },
          { organization: { id: "work", name: "Work" } },
        ]),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
        callback({
          session: { updateMany: vi.fn() },
          userModelCredential: {
            deleteMany: vi.fn(),
            findMany: vi.fn(async () => [{ secretId: "shared-secret" }]),
          },
          userVoiceCredential: {
            deleteMany: vi.fn(),
            findMany: vi.fn(async () => []),
          },
          secret: {
            updateMany: vi.fn(),
            deleteMany: secretDeleteMany,
          },
          organization: { delete: vi.fn() },
        }),
      ),
    } as unknown as PrismaClient;

    await deleteWorkspace(prisma, {
      userId: "user-1",
      workspaceId: "work",
      currentWorkspaceId: "work",
    });
    expect(secretDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        workspaceId: "work",
        id: { notIn: ["shared-secret"] },
      },
    });
  });
});
