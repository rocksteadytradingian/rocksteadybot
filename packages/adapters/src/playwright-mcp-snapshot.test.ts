import { describe, expect, it } from "vitest";
import {
  type McpToolOutput,
  parsePlaywrightActionResult,
  parsePlaywrightScreenshot,
  parsePlaywrightSnapshot,
  playwrightMcpCall,
} from "./playwright-mcp-snapshot.js";

function textOut(text: string, isError = false): McpToolOutput {
  return { content: [{ type: "text", text }], isError };
}

const NAV_OUTPUT = `### Ran Playwright code
\`\`\`js
await page.goto('https://example.test/');
\`\`\`

- Page URL: https://example.test/
- Page Title: Example Domain
- Page Snapshot:
\`\`\`yaml
- document "Example Domain":
  - heading "Example Domain" [ref=e2]
  - link "More information..." [ref=e3]
\`\`\`
`;

describe("playwrightMcpCall", () => {
  it("maps each action to its tool + args", () => {
    expect(playwrightMcpCall({ kind: "navigate", url: "https://a.test" })).toEqual({
      tool: "browser_navigate",
      args: { url: "https://a.test" },
    });
    expect(playwrightMcpCall({ kind: "click", ref: "e3" })).toEqual({
      tool: "browser_click",
      args: { element: "e3", ref: "e3" },
    });
    expect(playwrightMcpCall({ kind: "type", ref: "e5", text: "hi", submit: true })).toEqual({
      tool: "browser_type",
      args: { element: "e5", ref: "e5", text: "hi", submit: true },
    });
    expect(playwrightMcpCall({ kind: "select", ref: "e7", values: ["a", "b"] })).toEqual({
      tool: "browser_select_option",
      args: { element: "e7", ref: "e7", values: ["a", "b"] },
    });
    expect(playwrightMcpCall({ kind: "snapshot" }).tool).toBe("browser_snapshot");
    expect(playwrightMcpCall({ kind: "screenshot" }).tool).toBe("browser_take_screenshot");
  });
});

describe("parsePlaywrightSnapshot", () => {
  it("pulls url, title, and the fenced yaml tree", () => {
    const snap = parsePlaywrightSnapshot(textOut(NAV_OUTPUT));
    expect(snap?.url).toBe("https://example.test/");
    expect(snap?.title).toBe("Example Domain");
    expect(snap?.tree).toContain('link "More information..." [ref=e3]');
    expect(snap?.tree).not.toContain("Ran Playwright code");
    expect(snap?.hash).toHaveLength(16);
  });

  it("is stable across a cosmetic reformat of the same tree", () => {
    const a = parsePlaywrightSnapshot(textOut(NAV_OUTPUT));
    const b = parsePlaywrightSnapshot(
      textOut(NAV_OUTPUT.replace("[ref=e3]\n```", "[ref=e3]   \n\n```")),
    );
    expect(a?.hash).toBe(b?.hash);
  });

  it("returns undefined for empty output", () => {
    expect(parsePlaywrightSnapshot(textOut(""))).toBeUndefined();
  });
});

describe("parsePlaywrightActionResult", () => {
  it("reports ok with the fresh snapshot", () => {
    const result = parsePlaywrightActionResult(textOut(NAV_OUTPUT));
    expect(result.ok).toBe(true);
    expect(result.snapshot?.url).toBe("https://example.test/");
  });

  it("reports not-ok on an error result", () => {
    const result = parsePlaywrightActionResult(textOut("- Error: ref e9 not found", true));
    expect(result.ok).toBe(false);
    expect(result.note).toContain("Error");
  });
});

describe("parsePlaywrightScreenshot", () => {
  it("decodes the first image part", () => {
    const png = parsePlaywrightScreenshot({
      content: [
        { type: "text", text: "Took the screenshot" },
        { type: "image", data: Buffer.from("PNGDATA").toString("base64"), mimeType: "image/png" },
      ],
    });
    expect(Buffer.from(png!).toString()).toBe("PNGDATA");
  });

  it("returns undefined when there is no image", () => {
    expect(parsePlaywrightScreenshot(textOut("no image here"))).toBeUndefined();
  });
});
