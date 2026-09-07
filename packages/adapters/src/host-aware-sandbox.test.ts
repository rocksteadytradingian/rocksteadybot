import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DesktopSandboxProvider } from "./desktop-sandbox.js";
import { FakeSandboxProvider } from "./fake-sandbox.js";
import { HostAwareSandbox, sandboxKindForBot } from "./host-aware-sandbox.js";

const ctx = {
  operationId: "1",
  traceId: "1",
  workspaceId: "w",
  userId: "u",
  signal: new AbortController().signal,
};

describe("host-aware sandbox", () => {
  const hostRoot = mkdtempSync(path.join(tmpdir(), "rakazo-host-root-"));

  afterAll(() => {
    rmSync(hostRoot, { recursive: true, force: true });
  });

  it("lets this-mac cwd run under a host root", async () => {
    const desktop = new DesktopSandboxProvider({ hostRoots: [hostRoot] });
    const computer = await desktop.provision({ botId: "host", homePath: "/tmp/host-home" }, ctx);
    let code = 1;
    for await (const event of desktop.execute(
      computer,
      { argv: ["echo", "ok"], cwd: hostRoot },
      ctx,
    )) {
      if (event.type === "exit") code = event.code;
    }
    expect(code).toBe(0);
    await desktop.destroy(computer, ctx);
  });

  it("still refuses paths outside home and host roots", async () => {
    const desktop = new DesktopSandboxProvider({ hostRoots: [hostRoot] });
    const computer = await desktop.provision({ botId: "deny", homePath: "/tmp/deny" }, ctx);
    let stderr = "";
    let code = 0;
    for await (const event of desktop.execute(
      computer,
      { argv: ["echo", "nope"], cwd: "/etc" },
      ctx,
    )) {
      if (event.type === "stderr") stderr += event.data;
      if (event.type === "exit") code = event.code;
    }
    expect(code).toBe(1);
    expect(stderr).toMatch(/outside this computer's home/i);
    await desktop.destroy(computer, ctx);
  });

  it("lets a bot's own allow-listed folder be used as a cwd", async () => {
    const allowed = mkdtempSync(path.join(tmpdir(), "rakazo-bot-folder-"));
    const desktop = new DesktopSandboxProvider({
      resolveBotRoots: async (botId) => (botId === "bot-a" ? [allowed] : []),
    });
    const computer = await desktop.provision({ botId: "bot-a", homePath: "/tmp/bot-a-home" }, ctx);
    let code = 1;
    for await (const event of desktop.execute(
      computer,
      { argv: ["echo", "ok"], cwd: allowed },
      { ...ctx, botId: "bot-a" },
    )) {
      if (event.type === "exit") code = event.code;
    }
    expect(code).toBe(0);
    await desktop.destroy(computer, ctx);
    rmSync(allowed, { recursive: true, force: true });
  });

  it("refuses a folder another bot allow-listed, even on a shared computer", async () => {
    const otherBotFolder = mkdtempSync(path.join(tmpdir(), "rakazo-other-bot-"));
    const desktop = new DesktopSandboxProvider({
      resolveBotRoots: async (botId) => (botId === "bot-b" ? [otherBotFolder] : []),
    });
    const computer = await desktop.provision({ botId: "shared", homePath: "/tmp/shared" }, ctx);
    let stderr = "";
    let code = 0;
    for await (const event of desktop.execute(
      computer,
      { argv: ["echo", "nope"], cwd: otherBotFolder },
      { ...ctx, botId: "bot-a" },
    )) {
      if (event.type === "stderr") stderr += event.data;
      if (event.type === "exit") code = event.code;
    }
    expect(code).toBe(1);
    expect(stderr).toMatch(/outside this computer's home/i);
    await desktop.destroy(computer, ctx);
    rmSync(otherBotFolder, { recursive: true, force: true });
  });

  it("forwards a bot's folders to the isolated provider at provision time", async () => {
    const seen: Array<{ botId: string; folders?: string[] }> = [];
    const isolated = new FakeSandboxProvider();
    const original = isolated.provision.bind(isolated);
    isolated.provision = ((
      request: { botId: string; homePath: string; folders?: string[] },
      context: Parameters<typeof original>[1],
    ) => {
      seen.push({ botId: request.botId, folders: request.folders });
      return original(request, context);
    }) as typeof isolated.provision;
    const host = new DesktopSandboxProvider();
    const sandbox = new HostAwareSandbox(
      isolated,
      host,
      async () => false,
      async (botId) => (botId === "with-folders" ? ["/srv/data", "/srv/reports"] : []),
    );

    await sandbox.provision({ botId: "with-folders", homePath: "/tmp/a" }, ctx);
    await sandbox.provision({ botId: "team-ws", homePath: "/tmp/b" }, ctx);

    expect(seen).toEqual([
      { botId: "with-folders", folders: ["/srv/data", "/srv/reports"] },
      { botId: "team-ws", folders: undefined },
    ]);
  });

  it("provisions on the host provider when enabled", async () => {
    const isolated = new FakeSandboxProvider();
    const host = new DesktopSandboxProvider();
    const sandbox = new HostAwareSandbox(isolated, host, async () => true);
    const computer = await sandbox.provision({ botId: "switch", homePath: "/tmp/switch" }, ctx);
    expect(computer.kind).toBe("desktop");
    await sandbox.destroy(computer, ctx);
  });

  it("provisions on the isolated provider when this-mac is off", async () => {
    const isolated = new FakeSandboxProvider();
    const host = new DesktopSandboxProvider();
    const sandbox = new HostAwareSandbox(isolated, host, async () => false);
    const computer = await sandbox.provision({ botId: "iso", homePath: "/tmp/iso" }, ctx);
    expect(computer.kind).toBe("fake");
    await sandbox.destroy(computer, ctx);
  });

  it("maps the Linux bot home cwd onto the desktop home", async () => {
    const desktop = new DesktopSandboxProvider();
    const computer = await desktop.provision({ botId: "alias", homePath: "/tmp/alias" }, ctx);
    let code = 1;
    for await (const event of desktop.execute(
      computer,
      { argv: ["echo", "ok"], cwd: "/home/rakazo" },
      ctx,
    )) {
      if (event.type === "exit") code = event.code;
    }
    expect(code).toBe(0);
    await desktop.destroy(computer, ctx);
  });

  it("only switches docker deployments onto this Mac", () => {
    expect(sandboxKindForBot("docker", "this-mac")).toBe("desktop");
    expect(sandboxKindForBot("docker", "docker")).toBe("docker");
    expect(sandboxKindForBot("e2b", "this-mac")).toBe("e2b");
    expect(sandboxKindForBot("fake", "this-mac")).toBe("fake");
  });
});
