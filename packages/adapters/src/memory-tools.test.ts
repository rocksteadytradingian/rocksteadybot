import type { AdapterContext, ConnectorTool, MemoryStore } from "@rakazo/adapter-kit";
import { describe, expect, it, vi } from "vitest";
import { readDurableMemory, searchDurableMemory, selectMemoryTools } from "./memory-tools.js";

function tool(name: string): ConnectorTool {
  return { name, description: name, inputSchema: { type: "object", properties: {} } };
}

const context: AdapterContext = {
  operationId: "run-1",
  traceId: "run-1",
  workspaceId: "workspace-1",
  userId: "user-1",
  botId: "bot-1",
  signal: new AbortController().signal,
};

const allTools = [
  tool("remember"),
  tool("read_memory"),
  tool("search_memory"),
  tool("recall_memory"),
  tool("save_memory"),
  tool("shell"),
];

describe("selectMemoryTools", () => {
  it("keeps native remember and drops semantic memory tools when unconfigured", () => {
    const names = selectMemoryTools(allTools, false).map((t) => t.name);
    expect(names).toEqual(["remember", "read_memory", "search_memory", "shell"]);
  });

  it("keeps remember alongside semantic memory tools when configured", async () => {
    const names = selectMemoryTools(allTools, true).map((t) => t.name);
    expect(names).toEqual([
      "remember",
      "read_memory",
      "search_memory",
      "recall_memory",
      "save_memory",
      "shell",
    ]);
  });

  it("is a no-op for tool lists with no memory tools at all", () => {
    const shellOnly = [tool("shell")];
    expect(selectMemoryTools(shellOnly, false)).toEqual(shellOnly);
    expect(selectMemoryTools(shellOnly, true)).toEqual(shellOnly);
  });
});

describe("readDurableMemory", () => {
  it("returns the matching document", async () => {
    const read = vi.fn(async () => ({
      documents: [
        { id: "1", path: "MEMORY.md", content: "I am Ada", revision: 2, updatedAt: "2026-08-15" },
      ],
    }));

    await expect(
      readDurableMemory(
        { read } as unknown as MemoryStore,
        { path: "MEMORY.md", botId: "bot-1" },
        context,
      ),
    ).resolves.toEqual({
      ok: true,
      scope: "bot",
      path: "MEMORY.md",
      revision: 2,
      content: "I am Ada",
    });
    expect(read).toHaveBeenCalledWith({ scope: "bot", botId: "bot-1", path: "MEMORY.md" }, context);
  });

  it("rejects an empty path", async () => {
    await expect(
      readDurableMemory(
        { read: vi.fn() } as unknown as MemoryStore,
        { path: "  ", botId: "bot-1" },
        context,
      ),
    ).resolves.toEqual({ ok: false, error: "path is required." });
  });
});

describe("searchDurableMemory", () => {
  it("tags hits with the scope they came from", async () => {
    const search = vi.fn(async ({ scope }: { scope: string }) =>
      scope === "bot"
        ? [{ path: "MEMORY.md", snippet: "rust", score: 1 }]
        : [{ path: "profile.md", snippet: "Ada", score: 1 }],
    );

    const result = await searchDurableMemory(
      { search } as unknown as MemoryStore,
      { query: "Ada", botId: "bot-1" },
      context,
    );

    expect(result).toEqual({
      ok: true,
      results: [
        { scope: "bot", path: "MEMORY.md", snippet: "rust", score: 1 },
        { scope: "user", path: "profile.md", snippet: "Ada", score: 1 },
      ],
    });
  });

  it("rejects an empty query", async () => {
    await expect(
      searchDurableMemory(
        { search: vi.fn() } as unknown as MemoryStore,
        { query: " ", botId: "bot-1" },
        context,
      ),
    ).resolves.toEqual({ ok: false, error: "query is required." });
  });
});
