import type {
  AdapterContext,
  AdapterDescriptor,
  BrowserActionResult,
  BrowserDriver,
  BrowserDriverCapabilities,
  BrowserSession,
  BrowserSnapshot,
} from "@rakazo/adapter-kit";
import { McpSession } from "./mcp-transport.js";
import {
  type McpToolOutput,
  type PlaywrightMcpCall,
  parsePlaywrightActionResult,
  parsePlaywrightScreenshot,
  parsePlaywrightSnapshot,
  playwrightMcpCall,
} from "./playwright-mcp-snapshot.js";

export interface PlaywrightMcpOptions {
  /** Executable for `@playwright/mcp` (the operator installs it; e.g. `mcp-server-playwright`). */
  command: string;
  /** Extra CLI args appended after the profile / headless flags. */
  args?: string[];
  /** Absolute persistent profile directory for a profile id. */
  profileDir(profileId: string): string;
  /** Run Chromium with no visible window. Default false — a first sign-in needs the UI. */
  headless?: boolean;
  /** Close a session after this many ms with no calls. Default 5 minutes. */
  idleMs?: number;
  env?: Record<string, string>;
  connectTimeoutMs?: number;
  callTimeoutMs?: number;
}

const DEFAULT_IDLE_MS = 5 * 60_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_CALL_TIMEOUT_MS = 60_000;

/**
 * A {@link BrowserDriver} backed by a local `@playwright/mcp` process, one per profile id,
 * driving a persistent Chromium profile. The process runs on the host, outside the sandbox —
 * it holds the user's real logins. Sessions are lazy and self-close when idle.
 */
export function createPlaywrightMcpBrowser(options: PlaywrightMcpOptions): BrowserDriver {
  const sessions = new Map<string, PlaywrightMcpSession>();
  return {
    describe(): AdapterDescriptor<BrowserDriverCapabilities> {
      return {
        id: "playwright-mcp",
        contractVersion: "1",
        adapterVersion: "0.1.0",
        capabilities: { snapshot: true, screenshot: true, persistentProfile: true },
      };
    },
    async open(profileId: string, context: AdapterContext): Promise<BrowserSession> {
      const existing = sessions.get(profileId);
      if (existing && !existing.closed) {
        existing.touch();
        return existing;
      }
      const mcp = new McpSession({ name: `rakazo-browser-${profileId}` });
      const args = [
        "--user-data-dir",
        options.profileDir(profileId),
        "--isolated=false",
        ...(options.headless ? ["--headless"] : []),
        ...(options.args ?? []),
      ];
      await mcp.connectStdio({
        command: options.command,
        args,
        env: options.env ?? {},
        allowedCommands: [options.command],
        signal: context.signal,
        timeoutMs: options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      });
      const session = new PlaywrightMcpSession(mcp, options, () => {
        if (sessions.get(profileId) === session) sessions.delete(profileId);
      });
      sessions.set(profileId, session);
      return session;
    },
  };
}

class PlaywrightMcpSession implements BrowserSession {
  closed = false;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private readonly idleMs: number;
  private readonly callTimeoutMs: number;

  constructor(
    private readonly mcp: McpSession,
    options: PlaywrightMcpOptions,
    private readonly onClose: () => void,
  ) {
    this.idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
    this.callTimeoutMs = options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    this.touch();
  }

  touch(): void {
    if (this.closed) return;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.close(), this.idleMs);
    this.idleTimer.unref?.();
  }

  private async call(request: PlaywrightMcpCall): Promise<McpToolOutput> {
    if (this.closed) throw new Error("browser session is closed");
    const out = (await this.mcp.callTool(request.tool, request.args, {
      signal: AbortSignal.timeout(this.callTimeoutMs),
    })) as McpToolOutput;
    this.touch();
    return out;
  }

  async navigate(url: string): Promise<BrowserActionResult> {
    return parsePlaywrightActionResult(
      await this.call(playwrightMcpCall({ kind: "navigate", url })),
    );
  }

  async snapshot(): Promise<BrowserSnapshot> {
    const parsed = parsePlaywrightSnapshot(
      await this.call(playwrightMcpCall({ kind: "snapshot" })),
    );
    if (!parsed) throw new Error("playwright-mcp returned no snapshot");
    return parsed;
  }

  async click(ref: string): Promise<BrowserActionResult> {
    return parsePlaywrightActionResult(await this.call(playwrightMcpCall({ kind: "click", ref })));
  }

  async type(
    ref: string,
    text: string,
    options?: { submit?: boolean },
  ): Promise<BrowserActionResult> {
    return parsePlaywrightActionResult(
      await this.call(playwrightMcpCall({ kind: "type", ref, text, submit: options?.submit })),
    );
  }

  async select(ref: string, values: readonly string[]): Promise<BrowserActionResult> {
    return parsePlaywrightActionResult(
      await this.call(playwrightMcpCall({ kind: "select", ref, values })),
    );
  }

  async screenshot(): Promise<{ png: Uint8Array }> {
    const png = parsePlaywrightScreenshot(
      await this.call(playwrightMcpCall({ kind: "screenshot" })),
    );
    if (!png) throw new Error("playwright-mcp returned no screenshot");
    return { png };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    await this.mcp.close().catch(() => undefined);
    this.onClose();
  }
}
