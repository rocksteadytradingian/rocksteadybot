import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import {
  findDefaultModelCredential,
  findModelCredential,
  findUserProviderModelCredentials,
  newestModelCredentialOrder,
  rememberLastWorkingModel,
  restoreLastWorkingModel,
  shareUserProviderSecret,
} from "./model-credentials.js";

describe("findDefaultModelCredential", () => {
  it("uses the same deterministic newest-first selection for every caller", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { userModelCredential: { findFirst } } as unknown as PrismaClient;

    await findDefaultModelCredential(prisma, { userId: "user", workspaceId: "workspace" });

    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: "user", workspaceId: "workspace", isDefault: true },
      orderBy: newestModelCredentialOrder,
    });
  });
});

describe("findModelCredential", () => {
  it("selects the newest credential for a provider in the workspace", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { userModelCredential: { findFirst } } as unknown as PrismaClient;

    await findModelCredential(prisma, { userId: "user", workspaceId: "workspace" }, "xai");

    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: "user", workspaceId: "workspace", provider: "xai" },
      orderBy: newestModelCredentialOrder,
    });
  });
});

describe("findUserProviderModelCredentials", () => {
  it("lists the user's other secrets for the same provider across workspaces", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { userModelCredential: { findMany } } as unknown as PrismaClient;

    await findUserProviderModelCredentials(prisma, {
      userId: "user",
      provider: "anthropic",
      secretId: "stale-copy",
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user", provider: "anthropic", secretId: { not: "stale-copy" } },
      orderBy: newestModelCredentialOrder,
    });
  });
});

describe("shareUserProviderSecret", () => {
  it("points every workspace copy at the live secret and drops unused clones", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([{ secretId: "live" }]);
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = {
      userModelCredential: { updateMany, findMany },
      secret: { deleteMany },
    };

    await shareUserProviderSecret(tx as never, {
      userId: "user",
      provider: "anthropic",
      secretId: "live",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "user", provider: "anthropic", secretId: { not: "live" } },
      data: { secretId: "live" },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: "user", kind: "model", id: { notIn: ["live"] } },
    });
  });

  it("copies a stored OpenAI-compatible server URL onto every workspace copy", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findMany = vi.fn().mockResolvedValue([{ secretId: "live" }]);
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      userModelCredential: { updateMany, findMany },
      secret: { deleteMany },
    };

    await shareUserProviderSecret(tx as never, {
      userId: "user",
      provider: "openai-compatible",
      secretId: "live",
      baseUrl: "http://127.0.0.1:1234/v1",
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "user", provider: "openai-compatible", secretId: { not: "live" } },
      data: { secretId: "live", baseUrl: "http://127.0.0.1:1234/v1" },
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: "user", kind: "model", id: { notIn: ["live"] } },
    });
  });
});

describe("last working model", () => {
  it("stores a concrete provider/model and ignores Auto", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { member: { updateMany } } as unknown as PrismaClient;

    await rememberLastWorkingModel(
      prisma,
      { userId: "user", workspaceId: "ws" },
      { provider: "openai-compatible", modelId: "auto" },
    );
    expect(updateMany).not.toHaveBeenCalled();

    await rememberLastWorkingModel(
      prisma,
      { userId: "user", workspaceId: "ws" },
      { provider: "anthropic", modelId: "claude-opus-5" },
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "user", organizationId: "ws" },
      data: {
        lastWorkingModelProvider: "anthropic",
        lastWorkingModelId: "claude-opus-5",
      },
    });
  });

  it("promotes the remembered model to the workspace default", async () => {
    const memberFindUnique = vi.fn().mockResolvedValue({
      lastWorkingModelProvider: "anthropic",
      lastWorkingModelId: "claude-opus-5",
    });
    const credentialFindFirst = vi.fn(
      async (args: { where: { provider?: string; isDefault?: boolean } }) => {
        if (args.where.provider === "anthropic") {
          return {
            id: "cred-anthropic",
            provider: "anthropic",
            defaultModel: "claude-sonnet-5",
            isDefault: false,
          };
        }
        return {
          id: "cred-local",
          provider: "openai-compatible",
          defaultModel: "auto",
          isDefault: true,
        };
      },
    );
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      member: { findUnique: memberFindUnique },
      userModelCredential: { findFirst: credentialFindFirst, updateMany, update },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          userModelCredential: { updateMany, update },
        }),
      ),
    } as unknown as PrismaClient;

    await expect(
      restoreLastWorkingModel(prisma, { userId: "user", workspaceId: "ws" }),
    ).resolves.toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: "cred-anthropic" },
      data: { defaultModel: "claude-opus-5", isDefault: true },
    });
  });

  it("fills last working from the newest completed workspace-default run", async () => {
    const memberFindUnique = vi.fn().mockResolvedValue({
      lastWorkingModelProvider: null,
      lastWorkingModelId: null,
    });
    const memberUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const runFindFirst = vi.fn().mockResolvedValue({
      modelProvider: "anthropic",
      modelId: "claude-opus-5",
    });
    const credentialFindFirst = vi.fn(
      async (args: { where: { provider?: string; isDefault?: boolean } }) => {
        if (args.where.isDefault) {
          return {
            id: "cred-local",
            provider: "openai-compatible",
            defaultModel: "auto",
            isDefault: true,
          };
        }
        return {
          id: "cred-anthropic",
          provider: "anthropic",
          defaultModel: "claude-opus-5",
          isDefault: false,
        };
      },
    );
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      member: { findUnique: memberFindUnique, updateMany: memberUpdateMany },
      run: { findFirst: runFindFirst },
      userModelCredential: { findFirst: credentialFindFirst, updateMany, update },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          userModelCredential: { updateMany, update },
        }),
      ),
    } as unknown as PrismaClient;

    await expect(
      restoreLastWorkingModel(prisma, { userId: "user", workspaceId: "ws" }),
    ).resolves.toBe(true);
    expect(runFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws",
          userId: "user",
          status: "completed",
        }),
      }),
    );
    expect(memberUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user", organizationId: "ws" },
      data: {
        lastWorkingModelProvider: "anthropic",
        lastWorkingModelId: "claude-opus-5",
      },
    });
  });
});
