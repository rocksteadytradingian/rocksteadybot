import type { AdapterContext } from "@rakazo/adapter-kit";
import { describe, expect, it } from "vitest";
import { runBrowserContractChecks } from "./browser-conformance.js";
import { hashSnapshotTree } from "./browser-snapshot-util.js";
import { FakeBrowserDriver, type FakeBrowserSession, type FakePage } from "./fake-browser.js";

const CTX: AdapterContext = {
  operationId: "1",
  traceId: "1",
  workspaceId: "w",
  userId: "u",
  signal: new AbortController().signal,
};

function refFor(tree: string, name: string): string {
  const ref = tree
    .split("\n")
    .find((line) => line.includes(`"${name}"`))
    ?.match(/\[ref=([^\]]+)\]/)?.[1];
  if (!ref) throw new Error(`no ref for ${name}`);
  return ref;
}

const PAGES: Record<string, FakePage> = {
  "https://example.test/home": {
    title: "Home",
    submitUrl: "https://example.test/results",
    elements: [
      { role: "link", name: "To page two", href: "https://example.test/two" },
      { role: "textbox", name: "Search" },
      { role: "combobox", name: "Colour", options: ["red", "green"] },
    ],
  },
  "https://example.test/two": { title: "Page two" },
  "https://example.test/results": { title: "Results" },
};

describe("FakeBrowserDriver", () => {
  it("satisfies the browser driver contract", async () => {
    await runBrowserContractChecks(
      new FakeBrowserDriver(PAGES),
      {
        home: "https://example.test/home",
        two: "https://example.test/two",
        results: "https://example.test/results",
      },
      (ok, message) => expect(ok, message).toBe(true),
    );
  });

  it("records the actions a session took", async () => {
    const session = (await new FakeBrowserDriver(PAGES).open("p1", CTX)) as FakeBrowserSession;
    await session.navigate("https://example.test/home");
    const snap = await session.snapshot();
    const searchRef = refFor(snap.tree, "Search");
    await session.type(searchRef, "widgets");
    await session.close();
    expect(session.log).toEqual([
      "navigate https://example.test/home",
      `type ${searchRef} "widgets"`,
      "close",
    ]);
  });

  it("lands on a not-found page for an unknown URL", async () => {
    const session = await new FakeBrowserDriver(PAGES).open("p1", CTX);
    const result = await session.navigate("https://example.test/missing");
    expect(result.ok).toBe(true);
    expect(result.note).toContain("no page");
    expect(result.snapshot?.title).toBe("Not found");
  });
});

describe("hashSnapshotTree", () => {
  it("ignores trailing whitespace and blank-line runs", () => {
    expect(hashSnapshotTree("- a\n  - b")).toBe(hashSnapshotTree("- a   \n\n\n  - b  \n"));
  });

  it("changes when an element is added", () => {
    expect(hashSnapshotTree("- a\n  - b")).not.toBe(hashSnapshotTree("- a\n  - b\n  - c"));
  });
});
