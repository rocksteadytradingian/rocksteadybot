import type { AdapterContext, ComputerRef, SandboxProvider } from "@rakazo/adapter-kit";
import {
  displayBotWorkspacePath,
  resolveBotWorkspaceCwd,
  resolveBotWorkspacePath,
} from "./computer-support.js";
import { runSandboxCommand, type SandboxCommandContext } from "./sandbox-command.js";
import { textContentArg } from "./tool-text.js";

/** Every shared-team-computer tool, exposed only in a group thread. */
export const TEAM_COMPUTER_TOOL_NAMES = new Set([
  "team_observe",
  "team_act",
  "team_shell",
  "team_list_files",
  "team_read_file",
  "team_write_file",
]);

/** Read-only team tools — no external effect is recorded for these. */
export const TEAM_COMPUTER_READ_ONLY_TOOL_NAMES = new Set([
  "team_observe",
  "team_list_files",
  "team_read_file",
]);

/**
 * The non-graphical team tools (shell + files). `team_observe` / `team_act` stay in the
 * executor because they need screen redaction and frame dedup; these are pure sandbox I/O
 * against the shared team computer, namespaced to the calling bot's team folder.
 */
export const TEAM_FILE_TOOL_NAMES = new Set([
  "team_shell",
  "team_list_files",
  "team_read_file",
  "team_write_file",
]);

export async function runTeamFileTool(
  sandbox: Pick<SandboxProvider, "execute" | "listFiles" | "readFile" | "writeFile">,
  input: {
    name: string;
    args: Record<string, unknown>;
    ref: ComputerRef;
    ctx: AdapterContext & SandboxCommandContext;
    botId: string;
    maxBytes: number;
  },
): Promise<unknown> {
  const { name, args, ref, ctx, botId, maxBytes } = input;

  if (name === "team_shell") {
    const command = String(args.command ?? args.cmd ?? "");
    const cwd = resolveBotWorkspaceCwd("team", botId, args.cwd ? String(args.cwd) : undefined);
    return runSandboxCommand(sandbox, ref, ["bash", "-lc", command], cwd, ctx);
  }

  if (name === "team_list_files") {
    const requestedPath = String(args.path ?? "");
    const entries = await sandbox.listFiles(
      ref,
      resolveBotWorkspacePath("team", botId, requestedPath),
      ctx,
    );
    return {
      path: requestedPath,
      entries: entries.map((entry) => ({
        ...entry,
        path: displayBotWorkspacePath("team", botId, requestedPath, entry.path),
      })),
    };
  }

  if (name === "team_read_file") {
    const filePath = String(args.path ?? "");
    const storedPath = resolveBotWorkspacePath("team", botId, filePath);
    let bytes: Uint8Array;
    try {
      bytes = await sandbox.readFile(ref, storedPath, ctx, { maxBytes });
    } catch (error) {
      if (error instanceof Error && /exceeds \d+ bytes/.test(error.message)) {
        return { error: "file is too large for model context", path: filePath };
      }
      throw error;
    }
    if (bytes.byteLength > maxBytes) {
      return {
        error: "file is too large for model context",
        path: filePath,
        size: bytes.byteLength,
      };
    }
    try {
      return { path: filePath, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    } catch {
      return { error: "file is not UTF-8 text", path: filePath };
    }
  }

  if (name === "team_write_file") {
    const filePath = String(args.path ?? "notes/result.txt");
    const content = textContentArg(args.content, "");
    await sandbox.writeFile(
      ref,
      {
        path: resolveBotWorkspacePath("team", botId, filePath),
        content: new TextEncoder().encode(content),
      },
      ctx,
    );
    return { ok: true, path: filePath };
  }

  return { error: `unknown team tool ${name}` };
}
