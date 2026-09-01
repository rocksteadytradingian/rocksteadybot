import { describe, expect, it, vi } from "vitest";

let agentError = "WebSocket closed 1006";

vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: class {
    get state() {
      return { errorMessage: agentError, messages: [] };
    }

    subscribe() {}
    async prompt() {}
    async waitForIdle() {}
    abort() {}
  },
}));

vi.mock("@earendil-works/pi-ai/providers/all", () => ({
  builtinModels: () => ({
    getModel: () => ({ provider: "openai-codex", id: "gpt-test" }),
    streamSimple: vi.fn(),
  }),
}));

vi.mock("./pi-local-provider.js", () => ({
  registerLocalProvider: (models: unknown) => models,
}));

vi.mock("./pi-openai-compatible-provider.js", () => ({
  OPENAI_COMPATIBLE_PROVIDER_ID: "openai-compatible",
  registerOpenAiCompatibleCatalog: (models: unknown) => models,
  registerOpenAiCompatibleRuntime: (models: unknown) => models,
}));

import { PiAgentRuntime } from "./pi-runtime.js";

async function consume(
  runtime: PiAgentRuntime,
  model: { provider: string; id: string; baseUrl?: string },
) {
  for await (const _event of runtime.run(
    {
      botId: "bot",
      threadId: "thread",
      runId: "run",
      prompt: "continue",
      instructions: "test",
      history: [],
      tools: [],
      model,
    },
    {
      operationId: "operation",
      traceId: "trace",
      workspaceId: "workspace",
      userId: "user",
      signal: new AbortController().signal,
    },
  )) {
    // Consume the stream so terminal failures surface to the executor.
  }
}

describe("Pi runtime errors", () => {
  it("propagates provider failures instead of completing with error text", async () => {
    agentError = "WebSocket closed 1006";
    const runtime = new PiAgentRuntime();
    await expect(consume(runtime, { provider: "openai-codex", id: "gpt-test" })).rejects.toThrow(
      "WebSocket closed 1006",
    );
  });

  it("rewrites local connection failures into a reachable-server instruction", async () => {
    agentError = "Connection error.";
    const runtime = new PiAgentRuntime();
    await expect(
      consume(runtime, {
        provider: "openai-compatible",
        id: "qwen/qwen3-30b-a3b",
        baseUrl: "http://127.0.0.1:1234/v1",
      }),
    ).rejects.toThrow(
      "Could not reach the local model server at http://127.0.0.1:1234/v1. Start it and try again.",
    );
  });
});
