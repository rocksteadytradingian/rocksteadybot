import { describe, expect, it } from "vitest";
import {
  appContract,
  BOT_DESCRIPTION_MAX_LENGTH,
  BOT_INSTRUCTIONS_MAX_LENGTH,
  BOT_TITLE_MAX_LENGTH,
  CreateBotInput,
  CreateGroupInput,
  McpServerConfigInput,
  MessageBlock,
  ModelConnectInputSchema,
  ModelOAuthBeginSchema,
  ModelSetRouterInputSchema,
  normalizeCreateBotProfile,
  PendingApprovalSchema,
  ProductEventType,
  RepairStackInput,
  RunActivityRowSchema,
  RunSchema,
  UpdateBotInput,
  UpdateGroupInput,
} from "./index.js";

describe("contracts", () => {
  it("parses bot create input", () => {
    const parsed = CreateBotInput.parse({ name: "Chief" });
    expect(parsed.title).toBe("");
    expect(parsed.notifyOnFinish).toBe(true);
  });

  it("normalizes bot creation fields without losing the longer instruction copy", () => {
    const profile = normalizeCreateBotProfile({
      name: `  ${"N".repeat(100)}  `,
      title: `  ${"T".repeat(BOT_TITLE_MAX_LENGTH + 10)}  `,
      description: `  ${"D".repeat(BOT_INSTRUCTIONS_MAX_LENGTH + 10)}  `,
    });

    expect(profile.name).toHaveLength(80);
    expect(profile.title).toHaveLength(BOT_TITLE_MAX_LENGTH);
    expect(profile.description).toHaveLength(BOT_DESCRIPTION_MAX_LENGTH);
    expect(profile.instructions).toHaveLength(BOT_INSTRUCTIONS_MAX_LENGTH);
  });

  it("accepts the same title limit when creating and updating bots", () => {
    const title = "T".repeat(BOT_TITLE_MAX_LENGTH);
    expect(CreateBotInput.safeParse({ name: "Chief", title }).success).toBe(true);
    expect(UpdateBotInput.safeParse({ botId: "bot-1", title }).success).toBe(true);
    expect(UpdateBotInput.safeParse({ botId: "bot-1", title: `${title}T` }).success).toBe(false);
  });

  it("normalizes bot names and rejects whitespace-only values at the contract boundary", () => {
    expect(CreateBotInput.parse({ name: "  Chief  " }).name).toBe("Chief");
    expect(UpdateBotInput.parse({ botId: "bot-1", name: "  Atlas  " }).name).toBe("Atlas");
    expect(CreateBotInput.safeParse({ name: "   " }).success).toBe(false);
    expect(UpdateBotInput.safeParse({ botId: "bot-1", name: "   " }).success).toBe(false);
  });

  it("rejects partial model override clears on bot update", () => {
    expect(UpdateBotInput.safeParse({ botId: "bot-1", modelId: null }).success).toBe(false);
    expect(UpdateBotInput.safeParse({ botId: "bot-1", modelProvider: null }).success).toBe(false);
    expect(
      UpdateBotInput.safeParse({ botId: "bot-1", modelProvider: null, modelId: null }).success,
    ).toBe(true);
    expect(
      UpdateBotInput.safeParse({
        botId: "bot-1",
        modelProvider: "xai",
        modelId: "grok-4.6",
      }).success,
    ).toBe(true);
  });

  it("normalizes group names and rejects duplicate members", () => {
    expect(CreateGroupInput.parse({ name: "  Draft team  ", botIds: ["bot-1", "bot-2"] })).toEqual({
      name: "Draft team",
      botIds: ["bot-1", "bot-2"],
    });
    expect(CreateGroupInput.safeParse({ name: "   ", botIds: ["bot-1", "bot-2"] }).success).toBe(
      false,
    );
    expect(
      UpdateGroupInput.safeParse({ groupId: "group-1", botIds: ["bot-1", "bot-1"] }).success,
    ).toBe(false);
    expect(
      CreateGroupInput.parse({
        name: "Squad",
        botIds: ["bot-1", "bot-2"],
        defaultBotId: "bot-2",
      }),
    ).toEqual({
      name: "Squad",
      botIds: ["bot-1", "bot-2"],
      defaultBotId: "bot-2",
    });
    expect(
      CreateGroupInput.safeParse({
        name: "Squad",
        botIds: ["bot-1", "bot-2"],
        defaultBotId: "bot-3",
      }).success,
    ).toBe(false);
    expect(UpdateGroupInput.parse({ groupId: "group-1", defaultBotId: null })).toEqual({
      groupId: "group-1",
      defaultBotId: null,
    });
  });

  it("keeps model OAuth start results mode-specific", () => {
    const shared = {
      loginId: "login-1",
      provider: "anthropic",
      verificationUri: "https://example.com/authorize",
      expiresInSeconds: 900,
    };
    expect(ModelOAuthBeginSchema.safeParse({ ...shared, mode: "auth-url" }).success).toBe(true);
    expect(ModelOAuthBeginSchema.safeParse({ ...shared, mode: "device-code" }).success).toBe(false);
    expect(
      ModelOAuthBeginSchema.safeParse({ ...shared, mode: "device-code", userCode: "ABCD-1234" })
        .success,
    ).toBe(true);
    expect(
      ModelOAuthBeginSchema.safeParse({
        ...shared,
        mode: "auth-url",
        verificationUri: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("exposes the product rpc surface", () => {
    expect(appContract.models.beginOAuth).toBeTruthy();
    expect(appContract.models.completeOAuth).toBeTruthy();
    expect(appContract.bootstrap).toBeTruthy();
    expect(appContract.models.setDefault).toBeTruthy();
    expect(appContract.models.setRouter).toBeTruthy();
    expect(appContract.bots.create).toBeTruthy();
    expect(appContract.bots.archive).toBeTruthy();
    expect(appContract.bots.restore).toBeTruthy();
    expect(appContract.bots.remove).toBeTruthy();
    expect(appContract.botSections.list).toBeTruthy();
    expect(appContract.botSections.create).toBeTruthy();
    expect(appContract.threads.subscribe).toBeTruthy();
    expect(appContract.threads.clear).toBeTruthy();
    expect(appContract.voice.prepare).toBeTruthy();
    expect(appContract.notifications.registerPush).toBeTruthy();
    expect(ProductEventType.options).toContain("thread.message.created");
    expect(ProductEventType.options).toContain("thread.cleared");
    expect(ProductEventType.options).toContain("thread.subagent");
    expect(ProductEventType.options).toContain("bot.spawned");
  });

  it("accepts bot-to-bot runs in thread snapshots and activity rows", () => {
    const run = {
      id: "run-1",
      botId: "bot-1",
      threadId: "thread-1",
      taskId: "task-1",
      status: "running",
      trigger: "bot_message",
      routineId: null,
      modelProvider: null,
      modelId: null,
      error: null,
      startedAt: "2026-08-26T00:00:00.000Z",
      completedAt: null,
      createdAt: "2026-08-26T00:00:00.000Z",
    };

    expect(RunSchema.safeParse(run).success).toBe(true);
    expect(
      RunActivityRowSchema.safeParse({
        runId: run.id,
        botId: run.botId,
        botName: "Researcher",
        groupId: null,
        groupName: null,
        threadId: run.threadId,
        status: run.status,
        trigger: run.trigger,
        promptSnippet: "Review the report",
        updatedAt: "2026-08-26T00:00:01.000Z",
        outcomeStatus: null,
      }).success,
    ).toBe(true);
    expect(
      PendingApprovalSchema.safeParse({
        id: "effect-1",
        runId: run.id,
        messageId: "message-1",
        threadId: run.threadId,
        botId: run.botId,
        botName: "Researcher",
        groupId: null,
        groupName: null,
        summary: 'writing "Q1" to reports',
        toolName: "destination.write",
        highRisk: true,
        requestedAt: "2026-08-28T02:35:02.000Z",
      }).success,
    ).toBe(true);
    expect(
      PendingApprovalSchema.safeParse({
        id: "ops:worker-repair",
        kind: "stack_repair",
        runId: "ops:worker-repair",
        messageId: "ops:worker-repair",
        threadId: "ops:worker-repair",
        botId: "ops:worker-repair",
        botName: "RocksteadyBot",
        groupId: null,
        groupName: null,
        summary: "AI replies are stuck",
        toolName: "stack.repair",
        highRisk: true,
        requestedAt: "2026-08-28T08:45:27.000Z",
      }).success,
    ).toBe(true);
    expect(appContract.approvals.repairStack).toBeTruthy();
    expect(RepairStackInput.parse({ restartApi: true })).toEqual({ restartApi: true });

    const base = {
      runId: run.id,
      botId: run.botId,
      botName: "Researcher",
      groupId: null,
      groupName: null,
      threadId: run.threadId,
      status: run.status,
      trigger: run.trigger,
      promptSnippet: "Review the report",
      updatedAt: "2026-08-26T00:00:01.000Z",
    };
    expect(RunActivityRowSchema.safeParse({ ...base, outcomeStatus: "needs_review" }).success).toBe(
      true,
    );
    expect(RunActivityRowSchema.safeParse({ ...base, outcomeStatus: "flaky" }).success).toBe(false);
  });

  it("caps remote MCP headers", () => {
    const headers = Object.fromEntries(
      Array.from({ length: 33 }, (_, index) => [`X-Test-${index}`, "value"]),
    );
    expect(
      McpServerConfigInput.safeParse({
        slug: "demo",
        name: "Demo",
        transport: "streamable_http",
        endpoint: "https://mcp.example.test",
        headers,
      }).success,
    ).toBe(false);
  });

  it("rejects non-HTTPS MCP endpoints before storage", () => {
    const base = {
      slug: "demo",
      name: "Demo",
      transport: "streamable_http" as const,
      headers: {},
    };
    expect(
      McpServerConfigInput.safeParse({ ...base, endpoint: "http://127.0.0.1:3000/mcp" }).success,
    ).toBe(false);
    expect(
      McpServerConfigInput.safeParse({ ...base, endpoint: "https://mcp.example.test/mcp" }).success,
    ).toBe(true);
  });

  it("rejects oversized chart data wherever it is embedded", () => {
    const rows = Array.from({ length: 5_001 }, (_, index) => index);

    expect(
      MessageBlock.safeParse({ kind: "chart", name: "outer", spec: {}, data: rows }).success,
    ).toBe(false);
    expect(
      MessageBlock.safeParse({
        kind: "chart",
        name: "spec",
        spec: { data: rows },
        data: [],
      }).success,
    ).toBe(false);
    expect(
      MessageBlock.safeParse({
        kind: "chart",
        name: "marks",
        spec: { marks: [{ data: rows }] },
        data: [],
      }).success,
    ).toBe(false);
    expect(
      MessageBlock.safeParse({
        kind: "chart",
        name: "combined",
        spec: { marks: [{ data: rows.slice(0, 2_500) }] },
        data: rows.slice(0, 2_501),
      }).success,
    ).toBe(false);
  });

  it("rejects Auto as a Fast/Smart/Heavy slot", () => {
    expect(
      ModelSetRouterInputSchema.safeParse({
        provider: "openai-compatible",
        fast: "auto",
      }).success,
    ).toBe(false);
    expect(
      ModelSetRouterInputSchema.parse({
        provider: "openai-compatible",
        fast: "qwen3:8b",
        smart: "",
        heavy: "  ",
      }),
    ).toEqual({
      provider: "openai-compatible",
      fast: "qwen3:8b",
      smart: null,
      heavy: null,
    });
    expect(
      ModelConnectInputSchema.parse({
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:1234/v1",
        modelId: "auto",
        routerFastModel: "qwen3:8b",
        routerSmartModel: "qwen3:30b",
        routerHeavyModel: "",
      }),
    ).toMatchObject({
      modelId: "auto",
      routerFastModel: "qwen3:8b",
      routerSmartModel: "qwen3:30b",
      routerHeavyModel: null,
    });
    expect(
      ModelConnectInputSchema.parse({
        provider: "tokenrouter",
        apiKey: "tokenrouter-key",
        modelId: "z-ai/glm-5.2",
      }),
    ).toMatchObject({
      provider: "tokenrouter",
      apiKey: "tokenrouter-key",
      modelId: "z-ai/glm-5.2",
    });
    expect(
      ModelConnectInputSchema.safeParse({
        provider: "tokenrouter",
        apiKey: "tokenrouter-key",
      }).success,
    ).toBe(false);
  });
});
