import type { ConnectionCatalogItem } from "@rakazo/contracts";
import { matchFeaturedConnectorId } from "./featured-connectors.js";

export const PLUGIN_SECTION_PREVIEW = 4;

export const PLUGIN_CATEGORY_IDS = [
  "customer-support",
  "data-analytics",
  "design",
  "documents-and-files",
  "finance-and-legal",
  "inbox-and-collaboration",
  "infrastructure",
  "payments",
  "productivity",
  "research",
  "sales",
  "scheduling",
  "more",
] as const;

export type PluginCategoryId = (typeof PLUGIN_CATEGORY_IDS)[number];

export type PluginMarketplaceFilter = "all" | "featured" | "installed" | PluginCategoryId;

export const PLUGIN_CHIP_ORDER: readonly PluginMarketplaceFilter[] = [
  "all",
  "featured",
  "customer-support",
  "data-analytics",
  "design",
  "documents-and-files",
  "finance-and-legal",
  "inbox-and-collaboration",
  "infrastructure",
  "payments",
  "productivity",
  "research",
  "sales",
  "scheduling",
  "more",
];

export type PluginCatalogEntry = ConnectionCatalogItem & {
  description: string;
  category: PluginCategoryId;
};

export type PluginMarketplaceSection = {
  id: PluginMarketplaceFilter;
  items: PluginCatalogEntry[];
  total: number;
};

const KNOWN_DESCRIPTIONS: Record<string, string> = {
  airtable: "Read and update bases and records.",
  asana: "Track tasks and projects.",
  discord: "Send messages and search servers.",
  dropbox: "Search, read, and share files.",
  figma: "Browse files and design context.",
  github: "Read repos, issues, pull requests, and code.",
  gmail: "Search, read, draft, and manage email.",
  googlecalendar: "Search events and schedule meetings.",
  googledocs: "Read and draft documents.",
  googledrive: "Search, read, create, and share files.",
  googlesheets: "Read and update spreadsheets.",
  hubspot: "Search CRM records and update deals.",
  jira: "Search and update Jira issues.",
  linear: "Track issues and update project work.",
  notion: "Search and update pages, databases, and docs.",
  posthog: "Query product analytics and session data.",
  reddit: "Search posts and communities.",
  salesforce: "Search and update Salesforce records.",
  sentry: "Inspect errors and application health.",
  slack: "Message teammates and search workspace history.",
  stripe: "Look up customers, payments, and invoices.",
  trello: "Read and update boards and cards.",
  x: "Read and post on X.",
  zapier: "Trigger and run Zapier workflows.",
};

const KNOWN_CATEGORIES: Record<string, PluginCategoryId> = {
  airtable: "data-analytics",
  asana: "productivity",
  discord: "inbox-and-collaboration",
  dropbox: "documents-and-files",
  figma: "design",
  github: "infrastructure",
  gmail: "inbox-and-collaboration",
  googlecalendar: "scheduling",
  googledocs: "documents-and-files",
  googledrive: "documents-and-files",
  googlesheets: "data-analytics",
  hubspot: "sales",
  jira: "productivity",
  linear: "productivity",
  notion: "documents-and-files",
  posthog: "data-analytics",
  reddit: "research",
  salesforce: "sales",
  sentry: "infrastructure",
  slack: "inbox-and-collaboration",
  stripe: "payments",
  trello: "productivity",
  x: "inbox-and-collaboration",
  zapier: "productivity",
};

const CATEGORY_KEYWORDS: ReadonlyArray<{ id: PluginCategoryId; needles: readonly string[] }> = [
  { id: "scheduling", needles: ["calendar", "schedule", "meeting", "zoom", "gcal"] },
  { id: "payments", needles: ["stripe", "paypal", "payment", "billing", "invoice"] },
  { id: "design", needles: ["figma", "sketch", "canva", "adobe"] },
  { id: "customer-support", needles: ["zendesk", "intercom", "freshdesk", "helpscout", "support"] },
  {
    id: "finance-and-legal",
    needles: ["legal", "tax", "bank", "accounting", "quickbooks", "xero"],
  },
  { id: "sales", needles: ["hubspot", "salesforce", "crm", "pipedrive", "sales"] },
  {
    id: "data-analytics",
    needles: ["analytics", "posthog", "mixpanel", "datadog", "sheets", "bigquery", "snowflake"],
  },
  {
    id: "infrastructure",
    needles: ["github", "gitlab", "aws", "docker", "kubernetes", "sentry", "cloudflare"],
  },
  {
    id: "documents-and-files",
    needles: ["drive", "dropbox", "box", "docs", "notion", "confluence", "file"],
  },
  {
    id: "inbox-and-collaboration",
    needles: ["gmail", "mail", "slack", "discord", "teams", "twitter", "chat"],
  },
  { id: "research", needles: ["reddit", "news", "scholar", "wikipedia", "research"] },
  {
    id: "productivity",
    needles: ["jira", "asana", "trello", "linear", "todo", "clickup", "zapier"],
  },
];

function normalizePluginKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function lookupKey(slug: string, name: string): string {
  const featured = matchFeaturedConnectorId(slug) ?? matchFeaturedConnectorId(name);
  if (featured === "google-calendar") return "googlecalendar";
  if (featured === "google-drive") return "googledrive";
  if (featured) return featured;
  return normalizePluginKey(slug) || normalizePluginKey(name);
}

export function classifyPluginCategory(
  slug: string,
  name: string,
  categories?: readonly string[],
): PluginCategoryId {
  const declared = categories?.find((value) =>
    (PLUGIN_CATEGORY_IDS as readonly string[]).includes(value),
  );
  if (declared) return declared as PluginCategoryId;
  const key = lookupKey(slug, name);
  const known = KNOWN_CATEGORIES[key];
  if (known) return known;
  const haystack = `${normalizePluginKey(slug)} ${normalizePluginKey(name)}`;
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.needles.some((needle) => haystack.includes(normalizePluginKey(needle)))) {
      return rule.id;
    }
  }
  return "more";
}

export function pluginDescriptionFor(
  item: Pick<ConnectionCatalogItem, "slug" | "name" | "description">,
): string {
  const provided = item.description?.trim();
  if (provided) return provided;
  return KNOWN_DESCRIPTIONS[lookupKey(item.slug, item.name)] ?? "";
}

export function enrichPluginCatalogItem(item: ConnectionCatalogItem): PluginCatalogEntry {
  return {
    ...item,
    description: pluginDescriptionFor(item),
    category: classifyPluginCategory(item.slug, item.name, item.categories),
  };
}

export function isFeaturedPlugin(item: Pick<ConnectionCatalogItem, "slug" | "name">): boolean {
  return (
    matchFeaturedConnectorId(item.slug) !== null || matchFeaturedConnectorId(item.name) !== null
  );
}

export function pluginMatchesQuery(item: PluginCatalogEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    item.name.toLowerCase().includes(needle) ||
    item.slug.toLowerCase().includes(needle) ||
    item.connectorId.toLowerCase().includes(needle) ||
    item.description.toLowerCase().includes(needle)
  );
}

function matchesFilter(item: PluginCatalogEntry, filter: PluginMarketplaceFilter): boolean {
  if (filter === "all") return true;
  if (filter === "installed") return item.connected;
  if (filter === "featured") return isFeaturedPlugin(item);
  return item.category === filter;
}

export function presentPluginCategories(
  entries: readonly PluginCatalogEntry[],
): PluginMarketplaceFilter[] {
  const present = new Set<PluginMarketplaceFilter>(["all"]);
  if (entries.some((item) => isFeaturedPlugin(item))) present.add("featured");
  for (const item of entries) present.add(item.category);
  return PLUGIN_CHIP_ORDER.filter((id) => present.has(id));
}

export function selectPluginEntries(
  entries: readonly PluginCatalogEntry[],
  opts: { query?: string; filter?: PluginMarketplaceFilter },
): PluginCatalogEntry[] {
  const filter = opts.filter ?? "all";
  const query = opts.query ?? "";
  return entries.filter((item) => matchesFilter(item, filter) && pluginMatchesQuery(item, query));
}

export function buildPluginSections(
  entries: readonly PluginCatalogEntry[],
  opts: { filter?: PluginMarketplaceFilter; query?: string; previewLimit?: number } = {},
): PluginMarketplaceSection[] {
  const filter = opts.filter ?? "all";
  const query = opts.query ?? "";
  const previewLimit = opts.previewLimit ?? PLUGIN_SECTION_PREVIEW;
  const visible = selectPluginEntries(entries, { query, filter });
  const searching = query.trim().length > 0;

  if (filter !== "all" || searching) {
    if (visible.length === 0) return [];
    return [{ id: filter === "all" ? "featured" : filter, items: visible, total: visible.length }];
  }

  const rest = visible.filter((item) => !isFeaturedPlugin(item));
  const sections: PluginMarketplaceSection[] = [];
  for (const category of PLUGIN_CATEGORY_IDS) {
    const items = rest.filter((item) => item.category === category);
    if (items.length === 0) continue;
    sections.push({
      id: category,
      items: items.slice(0, previewLimit),
      total: items.length,
    });
  }
  return sections;
}
