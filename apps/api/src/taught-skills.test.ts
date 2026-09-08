import { FakeBrowserDriver, type FakePage } from "@rakazo/adapters";
import { describe, expect, it } from "vitest";
import { browserView, refFacts } from "./taught-skills.js";

const CTX = {
  operationId: "1",
  traceId: "1",
  workspaceId: "w",
  userId: "u",
  signal: new AbortController().signal,
};

const TREE = [
  '- document "Shop"',
  '  - link "Cart" [ref=e1]',
  '  - textbox "Coupon" [ref=e2]',
  '  - button "Apply" [ref=e3]',
].join("\n");

describe("refFacts", () => {
  it("reads the role and name for a ref", () => {
    expect(refFacts(TREE, "e2")).toEqual({ role: "textbox", name: "Coupon" });
    expect(refFacts(TREE, "e1")).toEqual({ role: "link", name: "Cart" });
  });

  it("returns empty for a missing ref or no ref", () => {
    expect(refFacts(TREE, "e9")).toEqual({});
    expect(refFacts(TREE)).toEqual({});
  });
});

describe("browserView", () => {
  it("returns the snapshot plus a data-URL screenshot", async () => {
    const pages: Record<string, FakePage> = {
      "https://shop.test": {
        title: "Shop",
        elements: [{ role: "link", name: "Cart", href: "https://shop.test/cart" }],
      },
    };
    const session = await new FakeBrowserDriver(pages).open("bot-1", CTX);
    await session.navigate("https://shop.test");
    const view = await browserView(session);
    expect(view.url).toBe("https://shop.test");
    expect(view.title).toBe("Shop");
    expect(view.tree).toContain("[ref=e1]");
    expect(view.hash).toHaveLength(16);
    expect(view.screenshot?.startsWith("data:image/png;base64,")).toBe(true);
  });
});
