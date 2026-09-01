import { RPCHandler } from "@orpc/server/fetch";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createRouter, type RouterDeps } from "./router.js";

describe("thread answer delivery", () => {
  it("accepts a durable answer when the immediate worker wake fails", async () => {
    const answerRunInput = vi.fn().mockResolvedValue(true);
    const enqueue = vi.fn().mockRejectedValue(new Error("job broker unavailable"));
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const prisma = {
      bot: {
        findFirst: vi.fn().mockResolvedValue({
          id: "bot-1",
          thread: { id: "thread-1" },
          computer: null,
        }),
      },
    } as unknown as PrismaClient;
    const deps = {
      prisma,
      events: { answerRunInput },
      jobs: { enqueue },
      env: {
        defaultProvider: "fake",
        defaultModel: "fake-model",
        webOrigin: "http://127.0.0.1:5173",
        screenProxySecret: "fake-test-secret",
        sandboxProvider: "fake",
      },
      dataDir: "/tmp/rakazo-router-test",
    } as unknown as RouterDeps;
    const actor = {
      workspaceId: "workspace-1",
      userId: "user-1",
      email: "user@rakazo.test",
      isDeploymentOwner: true,
    } satisfies Actor;
    const handler = new RPCHandler(createRouter(deps));

    const { matched, response } = await handler.handle(
      new Request("http://127.0.0.1/rpc/threads/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          json: {
            botId: "bot-1",
            runId: "run-1",
            messageId: "message-1",
            answer: "Paris",
          },
        }),
      }),
      { prefix: "/rpc", context: { actor } },
    );

    expect(matched).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ json: { ok: true } });
    expect(answerRunInput).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        threadId: "thread-1",
        runId: "run-1",
      }),
    );
    expect(enqueue).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith("thread answer enqueue", expect.any(Error));
    logError.mockRestore();
  });
});

describe("MCP server deletion", () => {
  it("does not fail when a concurrent credential rotation already removed the old secret", async () => {
    const deleteServer = vi.fn().mockResolvedValue({ id: "server-1" });
    const deleteSecrets = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      mcpServer: {
        findFirst: vi.fn().mockResolvedValue({ id: "server-1", secretId: "old-secret" }),
        delete: deleteServer,
      },
      secret: { deleteMany: deleteSecrets },
      $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    } as unknown as PrismaClient;
    const deps = {
      prisma,
      env: {
        defaultProvider: "fake",
        defaultModel: "fake-model",
        webOrigin: "http://127.0.0.1:5173",
        screenProxySecret: "fake-test-secret",
        sandboxProvider: "fake",
      },
      dataDir: "/tmp/rakazo-router-test",
    } as unknown as RouterDeps;
    const actor = {
      workspaceId: "workspace-1",
      userId: "user-1",
      email: "user@rakazo.test",
      isDeploymentOwner: true,
    } satisfies Actor;
    const handler = new RPCHandler(createRouter(deps));

    const { matched, response } = await handler.handle(
      new Request("http://127.0.0.1/rpc/mcp/servers/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { id: "server-1" } }),
      }),
      { prefix: "/rpc", context: { actor } },
    );

    expect(matched).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ json: { ok: true } });
    expect(deleteServer).toHaveBeenCalledWith({ where: { id: "server-1" } });
    expect(deleteSecrets).toHaveBeenCalledWith({
      where: {
        id: "old-secret",
        workspaceId: "workspace-1",
        userId: "user-1",
      },
    });
  });
});

describe("stack repair approval", () => {
  const env = {
    defaultProvider: "fake",
    defaultModel: "fake-model",
    webOrigin: "http://127.0.0.1:5173",
    screenProxySecret: "fake-test-secret",
    sandboxProvider: "fake",
  };

  it("lets the deployment owner start the worker", async () => {
    const repairWorkerStack = vi.fn().mockResolvedValue({ ok: true, started: ["worker"] });
    const deps = {
      prisma: {} as PrismaClient,
      env,
      dataDir: "/tmp/rakazo-router-test",
      repairWorkerStack,
    } as unknown as RouterDeps;
    const handler = new RPCHandler(createRouter(deps));
    const { response } = await handler.handle(
      new Request("http://127.0.0.1/rpc/approvals/repairStack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
      {
        prefix: "/rpc",
        context: {
          actor: {
            workspaceId: "workspace-1",
            userId: "user-1",
            email: "owner@rakazo.test",
            isDeploymentOwner: true,
          } satisfies Actor,
        },
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ json: { ok: true, started: ["worker"] } });
    expect(repairWorkerStack).toHaveBeenCalledOnce();
  });

  it("schedules a process exit when the owner restarts the API", async () => {
    const repairWorkerStack = vi.fn().mockResolvedValue({ ok: true, started: ["worker", "api"] });
    const scheduleProcessExit = vi.fn();
    const deps = {
      prisma: {} as PrismaClient,
      env,
      dataDir: "/tmp/rakazo-router-test",
      repairWorkerStack,
      scheduleProcessExit,
    } as unknown as RouterDeps;
    const handler = new RPCHandler(createRouter(deps));
    const { response } = await handler.handle(
      new Request("http://127.0.0.1/rpc/approvals/repairStack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: { restartApi: true } }),
      }),
      {
        prefix: "/rpc",
        context: {
          actor: {
            workspaceId: "workspace-1",
            userId: "user-1",
            email: "owner@rakazo.test",
            isDeploymentOwner: true,
          } satisfies Actor,
        },
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      json: { ok: true, started: ["worker", "api"] },
    });
    expect(repairWorkerStack).toHaveBeenCalledWith({ restartApi: true });
    expect(scheduleProcessExit).toHaveBeenCalledWith(0, 250);
  });

  it("lets a local signed-in user start host processes", async () => {
    const repairWorkerStack = vi.fn().mockResolvedValue({ ok: true, started: ["worker"] });
    const deps = {
      prisma: {} as PrismaClient,
      env,
      dataDir: "/tmp/rakazo-router-test",
      repairWorkerStack,
    } as unknown as RouterDeps;
    const handler = new RPCHandler(createRouter(deps));
    const { response } = await handler.handle(
      new Request("http://127.0.0.1/rpc/approvals/repairStack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
      {
        prefix: "/rpc",
        context: {
          actor: {
            workspaceId: "workspace-1",
            userId: "user-2",
            email: "member@rakazo.test",
            isDeploymentOwner: false,
          } satisfies Actor,
        },
      },
    );
    expect(response.status).toBe(200);
    expect(repairWorkerStack).toHaveBeenCalledOnce();
  });

  it("forbids a non-owner from starting host processes on a remote deployment", async () => {
    const repairWorkerStack = vi.fn();
    const deps = {
      prisma: {} as PrismaClient,
      env: { ...env, webOrigin: "https://rakazo.example.com" },
      dataDir: "/tmp/rakazo-router-test",
      repairWorkerStack,
    } as unknown as RouterDeps;
    const handler = new RPCHandler(createRouter(deps));
    const { response } = await handler.handle(
      new Request("http://127.0.0.1/rpc/approvals/repairStack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
      {
        prefix: "/rpc",
        context: {
          actor: {
            workspaceId: "workspace-1",
            userId: "user-2",
            email: "member@rakazo.test",
            isDeploymentOwner: false,
          } satisfies Actor,
        },
      },
    );
    expect(response.status).toBe(403);
    expect(repairWorkerStack).not.toHaveBeenCalled();
  });
});

describe("complexity router", () => {
  const actor = {
    workspaceId: "workspace-1",
    userId: "user-1",
    email: "user@rakazo.test",
    isDeploymentOwner: true,
  } satisfies Actor;

  async function callSetRouter(deps: RouterDeps, input: Record<string, unknown>) {
    const handler = new RPCHandler(createRouter(deps));
    const { response } = await handler.handle(
      new Request("http://127.0.0.1/rpc/models/setRouter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      }),
      { prefix: "/rpc", context: { actor } },
    );
    return response;
  }

  it("rejects routing on hosted providers", async () => {
    const response = await callSetRouter(
      { prisma: {} as PrismaClient, env: {}, dataDir: "/tmp" } as unknown as RouterDeps,
      { provider: "anthropic", fast: "claude-sonnet-5" },
    );
    expect(response.status).toBe(400);
  });

  it("rejects Auto as a slot and missing credentials", async () => {
    const findFirst = vi.fn(async () => null);
    const prisma = { userModelCredential: { findFirst } } as unknown as PrismaClient;
    const deps = { prisma, env: {}, dataDir: "/tmp" } as unknown as RouterDeps;

    const autoSlot = await callSetRouter(deps, {
      provider: "openai-compatible",
      fast: "auto",
    });
    expect(autoSlot.status).toBe(400);
    expect(findFirst).not.toHaveBeenCalled();

    const missing = await callSetRouter(deps, {
      provider: "openai-compatible",
      fast: "qwen3:8b",
    });
    expect(missing.status).toBe(400);
  });

  it("stores Fast/Smart/Heavy on the connected credential", async () => {
    const update = vi.fn(async () => ({ id: "cred-1" }));
    const prisma = {
      userModelCredential: {
        findFirst: vi.fn(async () => ({
          id: "cred-1",
          provider: "openai-compatible",
          isDefault: true,
        })),
        update,
      },
    } as unknown as PrismaClient;
    const response = await callSetRouter(
      { prisma, env: {}, dataDir: "/tmp" } as unknown as RouterDeps,
      { provider: "openai-compatible", fast: "qwen3:8b", smart: "qwen3:30b", heavy: "" },
    );
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      where: { id: "cred-1" },
      data: {
        routerFastModel: "qwen3:8b",
        routerSmartModel: "qwen3:30b",
        routerHeavyModel: null,
        defaultModel: "auto",
      },
    });
  });
});
