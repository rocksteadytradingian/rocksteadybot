import type {
  AdapterContext,
  ConnectorCall,
  ConnectorCatalogItem,
  ConnectorEvent,
  ConnectorTool,
  ManagedConnectorProvider,
} from "@rakazo/adapter-kit";
import { mergeCatalogWithConnected, type ToolkitDirectoryEntry } from "./composio-catalog-cache.js";

export const COMPOSIO_NOT_CONFIGURED_MESSAGE =
  "Save a Composio project key in Plugins to connect apps.";

/**
 * Curated Composio toolkit directory ported from OpenMausBot
 * (Apache-2.0, https://github.com/milind-soni/OpenMausBot).
 * Used when the live toolkit API is unavailable or no project key is set.
 */
export const CURATED_COMPOSIO_TOOLKITS: readonly ToolkitDirectoryEntry[] = [
  { slug: "slack", name: "Slack", logo: null, noAuth: false },
  { slug: "github", name: "GitHub", logo: null, noAuth: false },
  { slug: "gmail", name: "Gmail", logo: null, noAuth: false },
  { slug: "googlecalendar", name: "Google Calendar", logo: null, noAuth: false },
  { slug: "googlesheets", name: "Google Sheets", logo: null, noAuth: false },
  { slug: "googledocs", name: "Google Docs", logo: null, noAuth: false },
  { slug: "googledrive", name: "Google Drive", logo: null, noAuth: false },
  { slug: "notion", name: "Notion", logo: null, noAuth: false },
  { slug: "linear", name: "Linear", logo: null, noAuth: false },
  { slug: "sentry", name: "Sentry", logo: null, noAuth: false },
  { slug: "posthog", name: "PostHog", logo: null, noAuth: false },
  { slug: "discord", name: "Discord", logo: null, noAuth: false },
  { slug: "x", name: "X (Twitter)", logo: null, noAuth: false },
  { slug: "reddit", name: "Reddit", logo: null, noAuth: false },
  { slug: "zapier", name: "Zapier", logo: null, noAuth: false },
  { slug: "hubspot", name: "HubSpot", logo: null, noAuth: false },
  { slug: "salesforce", name: "Salesforce", logo: null, noAuth: false },
  { slug: "jira", name: "Jira", logo: null, noAuth: false },
  { slug: "asana", name: "Asana", logo: null, noAuth: false },
  { slug: "trello", name: "Trello", logo: null, noAuth: false },
  { slug: "dropbox", name: "Dropbox", logo: null, noAuth: false },
  { slug: "airtable", name: "Airtable", logo: null, noAuth: false },
  { slug: "figma", name: "Figma", logo: null, noAuth: false },
  { slug: "stripe", name: "Stripe", logo: null, noAuth: false },
];

export function composioDirectoryOrCurated(
  items: ToolkitDirectoryEntry[],
): ToolkitDirectoryEntry[] {
  return items.length > 0 ? items : [...CURATED_COMPOSIO_TOOLKITS];
}

function filterDirectory<T extends { name: string; slug: string }>(items: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) => item.name.toLowerCase().includes(needle) || item.slug.toLowerCase().includes(needle),
  );
}

/** Marketplace directory when Composio is not keyed. Connect still requires a project key. */
export class CuratedComposioCatalog implements ManagedConnectorProvider {
  describe() {
    return {
      id: "composio",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { discover: true, oauth: true, secretsBrokered: true },
    };
  }

  async catalog(context: AdapterContext, query?: string): Promise<ConnectorCatalogItem[]> {
    const connected = await this.listConnectedSlugs(context.userId);
    return filterDirectory(
      mergeCatalogWithConnected([...CURATED_COMPOSIO_TOOLKITS], connected),
      query ?? "",
    ).map((item) => ({ ...item, connectorId: "composio" }));
  }

  async warmDirectory(): Promise<void> {}

  async listConnectedSlugs(_userId: string): Promise<string[]> {
    return [];
  }

  async listConnectedExternalIds(context: AdapterContext): Promise<string[]> {
    return this.listConnectedSlugs(context.userId);
  }

  async discoverTools(_context: AdapterContext): Promise<ConnectorTool[]> {
    return [];
  }

  async *execute(_call: ConnectorCall, _context: AdapterContext): AsyncIterable<ConnectorEvent> {
    yield { type: "error", message: COMPOSIO_NOT_CONFIGURED_MESSAGE };
  }

  async begin(): Promise<{ authorizationUrl: string | null; state: string }> {
    throw new Error(COMPOSIO_NOT_CONFIGURED_MESSAGE);
  }

  async connectionReady(): Promise<boolean> {
    return false;
  }

  async complete(): Promise<{ connectionRef: string }> {
    throw new Error(COMPOSIO_NOT_CONFIGURED_MESSAGE);
  }

  async revoke(): Promise<void> {}
}
