import type { AdapterContext, ConnectorTool, MemoryStore } from "@rakazo/adapter-kit";

const SEMANTIC_MEMORY_TOOL_NAMES = new Set(["recall_memory", "save_memory"]);

export function selectMemoryTools(
  tools: ConnectorTool[],
  semanticMemoryConfigured: boolean,
): ConnectorTool[] {
  // Keep `remember` when semantic memory is on so identity files can still be written.
  return semanticMemoryConfigured
    ? tools
    : tools.filter((tool) => !SEMANTIC_MEMORY_TOOL_NAMES.has(tool.name));
}

const MEMORY_SCOPES = new Set(["bot", "user"]);
const SEARCH_SCOPES = new Set(["bot", "user", "all"]);
const MAX_MEMORY_PATH_CHARS = 240;
const MAX_SEARCH_RESULTS = 12;

export async function readDurableMemory(
  memory: MemoryStore,
  args: { scope?: string; path: string; botId: string },
  context: AdapterContext,
): Promise<
  | { ok: true; scope: "bot" | "user"; path: string; revision: number; content: string }
  | { ok: false; error: string }
> {
  const path = args.path.trim();
  if (!path || path.length > MAX_MEMORY_PATH_CHARS) {
    return { ok: false, error: "path is required." };
  }
  const scope = args.scope?.trim() || "bot";
  if (!MEMORY_SCOPES.has(scope)) {
    return { ok: false, error: 'scope must be "bot" or "user".' };
  }
  const snapshot = await memory.read(
    {
      scope: scope as "bot" | "user",
      botId: scope === "bot" ? args.botId : undefined,
      path,
    },
    context,
  );
  const document = snapshot.documents.find((entry) => entry.path === path) ?? snapshot.documents[0];
  if (!document) {
    return { ok: false, error: "No durable memory at that path." };
  }
  return {
    ok: true,
    scope: scope as "bot" | "user",
    path: document.path,
    revision: document.revision,
    content: document.content,
  };
}

export async function searchDurableMemory(
  memory: MemoryStore,
  args: { query: string; scope?: string; botId: string },
  context: AdapterContext,
): Promise<
  | {
      ok: true;
      results: Array<{ scope: "bot" | "user"; path: string; snippet: string; score: number }>;
    }
  | { ok: false; error: string }
> {
  const query = args.query.trim();
  if (!query) return { ok: false, error: "query is required." };
  const scope = args.scope?.trim() || "all";
  if (!SEARCH_SCOPES.has(scope)) {
    return { ok: false, error: 'scope must be "bot", "user", or "all".' };
  }

  const searches: Array<{ scope: "bot" | "user"; botId?: string }> = [];
  if (scope === "all" || scope === "bot") searches.push({ scope: "bot", botId: args.botId });
  if (scope === "all" || scope === "user") searches.push({ scope: "user" });

  const results: Array<{ scope: "bot" | "user"; path: string; snippet: string; score: number }> =
    [];
  for (const search of searches) {
    const hits = await memory.search({ query, scope: search.scope, botId: search.botId }, context);
    for (const hit of hits) {
      results.push({
        scope: search.scope,
        path: hit.path,
        snippet: hit.snippet,
        score: hit.score,
      });
      if (results.length >= MAX_SEARCH_RESULTS) {
        return { ok: true, results };
      }
    }
  }
  return { ok: true, results };
}
