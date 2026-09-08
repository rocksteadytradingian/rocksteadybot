import type { BrowserActionResult, BrowserSnapshot } from "@rakazo/adapter-kit";
import { hashSnapshotTree } from "./browser-snapshot-util.js";

/** A `@playwright/mcp` tool call: the tool name and its argument object. */
export interface PlaywrightMcpCall {
  tool: string;
  args: Record<string, unknown>;
}

/** Minimal shape of an MCP `CallToolResult` we read back. */
export interface McpToolOutput {
  content?: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType?: string }
    | { type: string; [key: string]: unknown }
  >;
  isError?: boolean;
}

/** Map a {@link BrowserSession} action to the `@playwright/mcp` tool that performs it. */
export function playwrightMcpCall(
  action:
    | { kind: "navigate"; url: string }
    | { kind: "snapshot" }
    | { kind: "click"; ref: string }
    | { kind: "type"; ref: string; text: string; submit?: boolean }
    | { kind: "select"; ref: string; values: readonly string[] }
    | { kind: "screenshot" },
): PlaywrightMcpCall {
  switch (action.kind) {
    case "navigate":
      return { tool: "browser_navigate", args: { url: action.url } };
    case "snapshot":
      return { tool: "browser_snapshot", args: {} };
    case "click":
      return { tool: "browser_click", args: { element: action.ref, ref: action.ref } };
    case "type":
      return {
        tool: "browser_type",
        args: {
          element: action.ref,
          ref: action.ref,
          text: action.text,
          submit: action.submit ?? false,
        },
      };
    case "select":
      return {
        tool: "browser_select_option",
        args: { element: action.ref, ref: action.ref, values: [...action.values] },
      };
    case "screenshot":
      return { tool: "browser_take_screenshot", args: {} };
  }
}

function allText(output: McpToolOutput): string {
  return (output.content ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

/**
 * Pull a {@link BrowserSnapshot} out of a `@playwright/mcp` tool result. Tolerant of the
 * format drifting between releases: URL and title come from labelled lines, and the tree is
 * the fenced ```yaml block when present, otherwise everything after a "Page Snapshot:" / "Page
 * state:" marker.
 */
export function parsePlaywrightSnapshot(output: McpToolOutput): BrowserSnapshot | undefined {
  const text = allText(output);
  if (!text.trim()) return undefined;

  const url = text.match(/(?:^|\n)\s*-?\s*Page URL:\s*(\S+)/i)?.[1] ?? "";
  const title = text.match(/(?:^|\n)\s*-?\s*Page Title:\s*(.+?)\s*(?:\n|$)/i)?.[1] ?? "";

  // playwright-mcp puts the a11y tree in a ```yaml block; earlier output also carries a
  // ```js code block, so match the yaml fence specifically before any generic fallback.
  const yamlFence = text.match(/```ya?ml\s*\n([\s\S]*?)\n```/i)?.[1];
  const afterMarker = text.match(
    /(?:Page Snapshot|Page state|Accessibility snapshot):\s*\n([\s\S]*?)(?:\n```|\n*$)/i,
  )?.[1];
  const lastFence = [...text.matchAll(/```[a-z]*\s*\n([\s\S]*?)\n```/gi)].at(-1)?.[1];
  const tree = (yamlFence ?? afterMarker ?? lastFence ?? text).trim();
  if (!tree) return undefined;

  return { url, title, tree, hash: hashSnapshotTree(tree) };
}

/** Turn a `@playwright/mcp` acting-tool result into a {@link BrowserActionResult}. */
export function parsePlaywrightActionResult(output: McpToolOutput): BrowserActionResult {
  const snapshot = parsePlaywrightSnapshot(output);
  const note = firstNote(allText(output));
  if (output.isError)
    return { ok: false, snapshot, note: note ?? "playwright-mcp reported an error" };
  return { ok: true, snapshot, note };
}

function firstNote(text: string): string | undefined {
  const line = text
    .split("\n")
    .map((row) => row.trim())
    .find((row) => /^(?:-\s*)?(?:Error|Result|Downloaded|Navigated|Warning)\b/i.test(row));
  return line || undefined;
}

/** Decode the first image part of a `browser_take_screenshot` result. */
export function parsePlaywrightScreenshot(output: McpToolOutput): Uint8Array | undefined {
  const image = (output.content ?? []).find(
    (part): part is { type: "image"; data: string; mimeType?: string } => part.type === "image",
  );
  if (!image?.data) return undefined;
  return Uint8Array.from(Buffer.from(image.data, "base64"));
}
