import { describe, expect, it } from "vitest";
import { createConnectorStack } from "./composio-connector.js";
import {
  COMPOSIO_NOT_CONFIGURED_MESSAGE,
  CURATED_COMPOSIO_TOOLKITS,
  CuratedComposioCatalog,
  composioDirectoryOrCurated,
} from "./composio-curated-catalog.js";

const context = {
  operationId: "test",
  traceId: "test",
  workspaceId: "workspace",
  userId: "user-1",
  signal: new AbortController().signal,
};

describe("curated Composio catalog", () => {
  it("includes OpenMausBot marketplace apps", () => {
    const slugs = CURATED_COMPOSIO_TOOLKITS.map((item) => item.slug);
    expect(slugs).toEqual(
      expect.arrayContaining([
        "gmail",
        "slack",
        "github",
        "notion",
        "linear",
        "googlecalendar",
        "googledrive",
      ]),
    );
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("falls back to the curated directory when the live list is empty", () => {
    expect(composioDirectoryOrCurated([])).toEqual([...CURATED_COMPOSIO_TOOLKITS]);
    expect(
      composioDirectoryOrCurated([{ slug: "gmail", name: "Gmail", logo: null, noAuth: false }]),
    ).toEqual([{ slug: "gmail", name: "Gmail", logo: null, noAuth: false }]);
  });

  it("serves the curated marketplace when Composio is not keyed", async () => {
    const stack = createConnectorStack(false);
    expect(stack.composio).toBeUndefined();
    const catalog = stack.connector.managed("composio");
    expect(catalog).toBeInstanceOf(CuratedComposioCatalog);
    const items = await catalog!.catalog(context);
    expect(items).toHaveLength(CURATED_COMPOSIO_TOOLKITS.length);
    expect(items.find((item) => item.slug === "github")).toMatchObject({
      connectorId: "composio",
      name: "GitHub",
      connected: false,
    });
    await expect(
      catalog!.begin({ provider: "github", redirectUrl: "http://example.test" }, context),
    ).rejects.toThrow(COMPOSIO_NOT_CONFIGURED_MESSAGE);
  });
});
