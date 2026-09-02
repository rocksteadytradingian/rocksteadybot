import type { ConnectionCatalogItem } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  buildPluginSections,
  classifyPluginCategory,
  enrichPluginCatalogItem,
  pluginDescriptionFor,
  presentPluginCategories,
  selectPluginEntries,
} from "./plugin-catalog.js";

function item(
  slug: string,
  name: string,
  extra?: Partial<ConnectionCatalogItem>,
): ConnectionCatalogItem {
  return {
    connectorId: "composio",
    slug,
    name,
    logo: null,
    connected: false,
    noAuth: false,
    ...extra,
  };
}

describe("plugin catalog marketplace", () => {
  it("classifies known slugs and aliases", () => {
    expect(classifyPluginCategory("gmail", "Gmail")).toBe("inbox-and-collaboration");
    expect(classifyPluginCategory("googlecalendar", "Google Calendar")).toBe("scheduling");
    expect(classifyPluginCategory("google_drive", "Google Drive")).toBe("documents-and-files");
    expect(classifyPluginCategory("github", "GitHub")).toBe("infrastructure");
    expect(classifyPluginCategory("figma", "Figma")).toBe("design");
    expect(classifyPluginCategory("stripe", "Stripe")).toBe("payments");
    expect(classifyPluginCategory("unknown-app", "Unknown App")).toBe("more");
  });

  it("uses declared categories and keyword fallbacks", () => {
    expect(classifyPluginCategory("custom", "Custom", ["design"])).toBe("design");
    expect(classifyPluginCategory("acme-zendesk", "Acme")).toBe("customer-support");
  });

  it("prefers catalog descriptions and fills known copy", () => {
    expect(pluginDescriptionFor(item("gmail", "Gmail"))).toBe(
      "Search, read, draft, and manage email.",
    );
    expect(pluginDescriptionFor(item("mystery", "Mystery", { description: "Live copy." }))).toBe(
      "Live copy.",
    );
    expect(pluginDescriptionFor(item("mystery", "Mystery"))).toBe("");
  });

  it("keeps featured apps out of All category previews", () => {
    const entries = [
      item("gmail", "Gmail"),
      item("github", "GitHub"),
      item("sentry", "Sentry"),
      item("stripe", "Stripe"),
      item("figma", "Figma"),
      item("asana", "Asana"),
      item("trello", "Trello"),
      item("jira", "Jira"),
      item("zapier", "Zapier"),
    ].map(enrichPluginCatalogItem);
    const sections = buildPluginSections(entries);
    expect(sections.find((section) => section.id === "featured")).toBeUndefined();
    expect(
      sections.find((section) => section.id === "infrastructure")?.items.map((row) => row.slug),
    ).toEqual(["sentry"]);
    expect(sections.find((section) => section.id === "payments")?.items[0]?.slug).toBe("stripe");
    const productivity = sections.find((section) => section.id === "productivity");
    expect(productivity?.items.map((row) => row.slug)).toEqual([
      "asana",
      "trello",
      "jira",
      "zapier",
    ]);
    expect(productivity?.total).toBe(4);
  });

  it("truncates All category sections when more than four apps remain", () => {
    const entries = [
      item("asana", "Asana"),
      item("trello", "Trello"),
      item("jira", "Jira"),
      item("zapier", "Zapier"),
      item("clickup", "ClickUp"),
    ].map(enrichPluginCatalogItem);
    const productivity = buildPluginSections(entries).find(
      (section) => section.id === "productivity",
    );
    expect(productivity?.items.map((row) => row.slug)).toEqual([
      "asana",
      "trello",
      "jira",
      "zapier",
    ]);
    expect(productivity?.total).toBe(5);
  });

  it("filters to one category and searches descriptions", () => {
    const entries = [item("gmail", "Gmail"), item("stripe", "Stripe"), item("figma", "Figma")].map(
      enrichPluginCatalogItem,
    );
    expect(selectPluginEntries(entries, { filter: "payments" }).map((row) => row.slug)).toEqual([
      "stripe",
    ]);
    expect(selectPluginEntries(entries, { query: "email" }).map((row) => row.slug)).toEqual([
      "gmail",
    ]);
    expect(presentPluginCategories(entries)).toEqual([
      "all",
      "featured",
      "design",
      "inbox-and-collaboration",
      "payments",
    ]);
  });

  it("lists only connected apps for the installed filter", () => {
    const entries = [item("gmail", "Gmail", { connected: true }), item("stripe", "Stripe")].map(
      enrichPluginCatalogItem,
    );
    expect(selectPluginEntries(entries, { filter: "installed" }).map((row) => row.slug)).toEqual([
      "gmail",
    ]);
  });
});
