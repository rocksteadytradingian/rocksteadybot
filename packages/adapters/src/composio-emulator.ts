import type {
  AdapterContext,
  ConnectorCall,
  ConnectorEvent,
  ConnectorTool,
} from "@rakazo/adapter-kit";
import {
  type ComposioCatalogItem,
  type ComposioProvider,
  filterCatalog,
} from "./composio-connector.js";

const DEFAULT_CATALOG: ReadonlyArray<Omit<ComposioCatalogItem, "connected">> = [
  { slug: "GMAIL", name: "Gmail", logo: null, noAuth: false },
  { slug: "GOOGLECALENDAR", name: "Google Calendar", logo: null, noAuth: false },
  { slug: "GOOGLEDRIVE", name: "Google Drive", logo: null, noAuth: false },
  { slug: "SLACK", name: "Slack", logo: null, noAuth: false },
  { slug: "GITHUB", name: "GitHub", logo: null, noAuth: false },
  { slug: "NOTION", name: "Notion", logo: null, noAuth: false },
];

/** Deterministic, offline Composio catalog and connection emulator for product tests. */
export class ComposioEmulator implements ComposioProvider {
  // Keyed by entityId(userId, workspaceId) — mirrors the real connector's per-workspace
  // Composio identity, so tests can prove two workspaces hold separate connections.
  private readonly connectedByEntity = new Map<string, Set<string>>();
  readonly executions: Array<{
    userId: string;
    tool: string;
    args: Record<string, unknown>;
  }> = [];

  constructor(
    private readonly directory: ReadonlyArray<
      Omit<ComposioCatalogItem, "connected">
    > = DEFAULT_CATALOG,
  ) {}

  describe() {
    return {
      id: "composio",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { discover: true, oauth: true, secretsBrokered: true },
    };
  }

  private entityId(userId: string, workspaceId: string): string {
    return `${userId}:${workspaceId}`;
  }

  async catalog(context: AdapterContext, query?: string) {
    const connected =
      this.connectedByEntity.get(this.entityId(context.userId, context.workspaceId)) ??
      new Set<string>();
    return filterCatalog(
      this.directory.map((item) => ({ ...item, connected: connected.has(item.slug) })),
      query ?? "",
    ).map((item) => ({ ...item, connectorId: "composio" }));
  }

  async warmDirectory(): Promise<void> {}

  async listConnectedSlugs(userId: string, workspaceId: string): Promise<string[]> {
    return [...(this.connectedByEntity.get(this.entityId(userId, workspaceId)) ?? [])];
  }

  async listConnectedExternalIds(context: AdapterContext): Promise<string[]> {
    return this.listConnectedSlugs(context.userId, context.workspaceId);
  }

  async discoverTools(context: AdapterContext): Promise<ConnectorTool[]> {
    const connected =
      context.connectedConnections
        ?.filter((connection) => connection.connectorId === "composio")
        .map((connection) => connection.externalId) ??
      context.connectedProviders ??
      [];
    return [...new Set(connected)].map((slug) => ({
      name: `${slug}_EMULATED_ACTION`,
      description: `Run a deterministic ${slug} action`,
      inputSchema: {
        type: "object",
        properties: { value: { type: "string" } },
      },
    }));
  }

  async *execute(call: ConnectorCall, context: AdapterContext): AsyncIterable<ConnectorEvent> {
    this.executions.push({ userId: context.userId, tool: call.tool, args: call.args });
    yield { type: "result", data: { ok: true, tool: call.tool, args: call.args } };
  }

  async begin(
    request: { provider: string; redirectUrl: string },
    context: AdapterContext,
  ): Promise<{ authorizationUrl: string | null; state: string }> {
    const entity = this.entityId(context.userId, context.workspaceId);
    const connected = this.connectedByEntity.get(entity) ?? new Set<string>();
    connected.add(request.provider);
    this.connectedByEntity.set(entity, connected);
    return { authorizationUrl: null, state: request.provider };
  }

  async connectionReady(context: AdapterContext, slug: string): Promise<boolean> {
    return (
      this.connectedByEntity.get(this.entityId(context.userId, context.workspaceId))?.has(slug) ??
      false
    );
  }

  async complete(
    request: { state: string; code?: string },
    _context: AdapterContext,
  ): Promise<{ connectionRef: string }> {
    return { connectionRef: request.state };
  }

  async revoke(connectionRef: string, context: AdapterContext): Promise<void> {
    this.connectedByEntity
      .get(this.entityId(context.userId, context.workspaceId))
      ?.delete(connectionRef);
  }
}
