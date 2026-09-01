import type { ConnectionCatalogItem } from "@rakazo/contracts";

export const FEATURED_CONNECTOR_IDS = [
  "gmail",
  "google-calendar",
  "google-drive",
  "slack",
  "github",
  "notion",
  "linear",
] as const;

export type FeaturedConnectorId = (typeof FEATURED_CONNECTOR_IDS)[number];

export const FEATURED_CONNECTOR_LABELS: Record<FeaturedConnectorId, string> = {
  gmail: "Gmail",
  "google-calendar": "Google Calendar",
  "google-drive": "Google Drive",
  slack: "Slack",
  github: "GitHub",
  notion: "Notion",
  linear: "Linear",
};

const FEATURED_CONNECTOR_SLUGS: Record<FeaturedConnectorId, string> = {
  gmail: "gmail",
  "google-calendar": "googlecalendar",
  "google-drive": "googledrive",
  slack: "slack",
  github: "github",
  notion: "notion",
  linear: "linear",
};

const FEATURED_ALIASES: Record<FeaturedConnectorId, readonly string[]> = {
  gmail: ["gmail", "googlemail", "google mail"],
  "google-calendar": ["googlecalendar", "google calendar", "google_calendar", "gcal"],
  "google-drive": ["googledrive", "google drive", "google_drive", "gdrive"],
  slack: ["slack", "slackbot"],
  github: ["github", "gh"],
  notion: ["notion", "notion.so"],
  linear: ["linear", "linear.app"],
};

export type FeaturedConnectorTile = {
  id: FeaturedConnectorId;
  label: string;
  item?: ConnectionCatalogItem;
  /** Catalog has items but none matched this featured connector. */
  missing: boolean;
};

function normalizeConnectorKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function matchFeaturedConnectorId(value: string): FeaturedConnectorId | null {
  const normalized = normalizeConnectorKey(value);
  if (!normalized) return null;
  for (const id of FEATURED_CONNECTOR_IDS) {
    if (FEATURED_ALIASES[id].some((alias) => normalizeConnectorKey(alias) === normalized)) {
      return id;
    }
  }
  return null;
}

export function featuredConnectorProvidersMatch(left: string, right: string): boolean {
  if (left === right) return true;
  const leftId = matchFeaturedConnectorId(left);
  const rightId = matchFeaturedConnectorId(right);
  return leftId !== null && leftId === rightId;
}

export function featuredConnectorCatalogItem(id: FeaturedConnectorId): ConnectionCatalogItem {
  return {
    connectorId: "composio",
    slug: FEATURED_CONNECTOR_SLUGS[id],
    name: FEATURED_CONNECTOR_LABELS[id],
    logo: null,
    connected: false,
    noAuth: false,
  };
}

export function resolveFeaturedCatalogItem(
  id: FeaturedConnectorId,
  catalog: readonly ConnectionCatalogItem[],
): ConnectionCatalogItem | undefined {
  for (const item of catalog) {
    if (matchFeaturedConnectorId(item.slug) === id) return item;
    if (matchFeaturedConnectorId(item.name) === id) return item;
  }
  return undefined;
}

export function buildFeaturedConnectorTiles(
  catalog: readonly ConnectionCatalogItem[],
): FeaturedConnectorTile[] {
  const hasCatalog = catalog.length > 0;
  return FEATURED_CONNECTOR_IDS.map((id) => {
    const item = hasCatalog
      ? resolveFeaturedCatalogItem(id, catalog)
      : featuredConnectorCatalogItem(id);
    return {
      id,
      label: FEATURED_CONNECTOR_LABELS[id],
      item,
      missing: hasCatalog && !item,
    };
  });
}

export const EMPTY_PLUGIN_CATALOG_MESSAGE =
  "Configure a plugin catalog on the server to connect apps.";
