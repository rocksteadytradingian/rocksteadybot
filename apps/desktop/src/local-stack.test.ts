import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  composeUpArgs,
  desktopShortcutDetails,
  desktopShortcutPath,
  ensureLocalStack,
  findRepoRoot,
  isOwnStackProcess,
  isPortConflictOutput,
  isRakazoApiHealth,
  type LocalStackHost,
  listeningPidsFromNetstat,
  listeningPidsFromSs,
  localPortFromAddress,
  localStackAutoConnectOnFirstRun,
  localStackAutoStartEnabled,
  looksLikeRepoRoot,
  resolveDockerBin,
  whichOnPath,
} from "./local-stack.js";
import { isManagedLocalWebUrl } from "./setup-config.js";

const files = new Set<string>();
let userData: string | undefined;

afterEach(async () => {
  files.clear();
  if (userData !== undefined) await rm(userData, { recursive: true, force: true });
  userData = undefined;
});

function fakeHost(
  overrides: Partial<LocalStackHost> & { files?: string[] } = {},
): LocalStackHost & {
  commands: Array<{ file: string; args: string[] }>;
  stopped: number[];
} {
  for (const file of overrides.files ?? []) files.add(path.normalize(file));
  const commands: Array<{ file: string; args: string[] }> = [];
  const stopped: number[] = [];
  let clock = 1_000;
  const { files: _ignored, run, stopPid, ...rest } = overrides;
  return {
    exists: (filePath) => files.has(path.normalize(filePath)),
    fetchJson: async () => ({ error: "connection refused" }),
    run: async (file, args, opts) => {
      commands.push({ file, args });
      if (run) return run(file, args, opts);
      if (file.endsWith("docker") || file.endsWith("docker.exe")) {
        if (args[0] === "info") return { code: 0, stdout: "Server", stderr: "" };
        if (args[0] === "compose") return { code: 0, stdout: "Started", stderr: "" };
      }
      return { code: 0, stdout: "", stderr: "" };
    },
    commandLineForPid: async () => null,
    stopPid: async (pid) => {
      stopped.push(pid);
      if (stopPid) await stopPid(pid);
    },
    sleep: async () => {
      clock += 2_000;
    },
    now: () => clock,
    platform: "linux",
    pathEnv: "/usr/bin",
    env: {},
    homedir: "/home/user",
    selfPid: 9,
    ...rest,
    commands,
    stopped,
  };
}

describe("managed local URL", () => {
  it("only auto-starts Compose for the loopback web origin", () => {
    expect(isManagedLocalWebUrl("http://127.0.0.1:5173")).toBe(true);
    expect(isManagedLocalWebUrl("127.0.0.1:5173")).toBe(true);
    expect(isManagedLocalWebUrl("http://localhost:5173")).toBe(true);
    expect(isManagedLocalWebUrl("http://127.0.0.1:3100")).toBe(false);
    expect(isManagedLocalWebUrl("https://rakazo.example.com")).toBe(false);
    expect(isManagedLocalWebUrl("data:text/html,fixture")).toBe(false);
  });
});

describe("env gates", () => {
  it("stays out of the way of test harnesses and forced setup", () => {
    expect(localStackAutoStartEnabled({})).toBe(true);
    expect(localStackAutoStartEnabled({ RAKAZO_DISABLE_LOCAL_STACK: "1" })).toBe(false);
    expect(localStackAutoStartEnabled({ RAKAZO_WEB_URL: "http://127.0.0.1:9" })).toBe(false);
    expect(localStackAutoConnectOnFirstRun({ RAKAZO_FORCE_SETUP: "1" })).toBe(false);
    expect(localStackAutoConnectOnFirstRun({})).toBe(true);
  });
});

describe("repo root", () => {
  it("walks up until it sees Compose and the workspace file", async () => {
    userData = await mkdtemp(path.join(tmpdir(), "rakazo-repo-"));
    const nested = path.join(userData, "apps", "desktop", "dist");
    await mkdir(nested, { recursive: true });
    await mkdir(path.join(userData, "infra", "compose"), { recursive: true });
    await writeFile(
      path.join(userData, "infra", "compose", "docker-compose.yml"),
      "services: {}\n",
    );
    await writeFile(path.join(userData, "pnpm-workspace.yaml"), "packages: []\n");

    expect(looksLikeRepoRoot(userData, existsSync)).toBe(true);
    expect(findRepoRoot([nested, "/tmp/nowhere"], existsSync)).toBe(userData);
  });
});

describe("port owners", () => {
  it("reads Windows netstat LISTENING pids", () => {
    const output = [
      "  TCP    0.0.0.0:3100           0.0.0.0:0              LISTENING       4242",
      "  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       77",
      "  TCP    [::]:3100              [::]:0                 LISTENING       4242",
      "  TCP    127.0.0.1:3100         127.0.0.1:54321        ESTABLISHED     99",
    ].join("\n");
    expect(listeningPidsFromNetstat(output, 3100)).toEqual([4242]);
    expect(listeningPidsFromNetstat(output, 5173)).toEqual([77]);
  });

  it("reads ss pids", () => {
    expect(
      listeningPidsFromSs('LISTEN 0 511 127.0.0.1:3100 0.0.0.0:* users:(("node",pid=4242,fd=23))'),
    ).toEqual([4242]);
  });

  it("parses ipv6 local ports", () => {
    expect(localPortFromAddress("[::1]:5173")).toBe(5173);
    expect(localPortFromAddress("127.0.0.1:3100")).toBe(3100);
  });

  it("only stops leftover processes from this stack", () => {
    expect(isOwnStackProcess("node /repo/apps/api/dist/index.js")).toBe(true);
    expect(isOwnStackProcess("pnpm --filter @rakazo/api start")).toBe(true);
    expect(
      isOwnStackProcess("C:\\Program Files\\Docker\\Docker\\resources\\com.docker.backend.exe"),
    ).toBe(false);
    expect(isOwnStackProcess("docker-proxy -proto tcp -host-port 3100")).toBe(false);
    expect(isOwnStackProcess("C:\\repo\\node_modules\\electron\\dist\\electron.exe .")).toBe(false);
  });

  it("recognizes Compose bind failures", () => {
    expect(
      isPortConflictOutput(
        "Error: ports are not available: bind: Only one usage of each socket address",
      ),
    ).toBe(true);
    expect(isPortConflictOutput("image pulled")).toBe(false);
  });
});

describe("compose and shortcut", () => {
  it("starts Compose without publishing host :3100", () => {
    expect(composeUpArgs(true)).toEqual([
      "compose",
      "--env-file",
      ".env",
      "-f",
      "infra/compose/docker-compose.yml",
      "-f",
      "infra/compose/docker-compose.desktop.yml",
      "up",
      "-d",
      "--remove-orphans",
    ]);
    expect(composeUpArgs(false)[1]).toBe("-f");
  });

  it("points the Windows shortcut at the launcher script", () => {
    const details = desktopShortcutDetails("/repo");
    expect(details?.target).toBe(
      path.join("/repo", "apps", "desktop", "scripts", "open-desktop.cmd"),
    );
    expect(details?.cwd).toBe("/repo");
    expect(desktopShortcutPath("/home/user")).toBe(
      path.join("/home/user", "Desktop", "RocksteadyBot.lnk"),
    );
  });

  it("finds docker.exe on PATH or in Program Files", () => {
    expect(
      whichOnPath("docker", "/usr/local/bin", "linux", (file) => file === "/usr/local/bin/docker"),
    ).toBe("/usr/local/bin/docker");
    expect(
      resolveDockerBin("win32", "C:\\Windows", (file) =>
        file
          .toLowerCase()
          .endsWith(path.join("Docker", "resources", "bin", "docker.exe").toLowerCase()),
      ),
    ).toMatch(/docker\.exe$/i);
  });
});

describe("ensureLocalStack", () => {
  const repo = path.resolve("/repo");
  const compose = path.join(repo, "infra", "compose", "docker-compose.yml");
  const workspace = path.join(repo, "pnpm-workspace.yaml");
  const envFile = path.join(repo, ".env");
  const docker = "/usr/bin/docker";
  const launcher = path.join(repo, "apps", "desktop", "scripts", "open-desktop.cmd");

  function repoFiles() {
    return [compose, workspace, envFile, docker, launcher];
  }

  it("does nothing for a remote or disabled target", async () => {
    const host = fakeHost({ env: { RAKAZO_DISABLE_LOCAL_STACK: "1" }, files: repoFiles() });
    await expect(
      ensureLocalStack({
        targetUrl: "http://127.0.0.1:5173",
        searchFrom: [repo],
        host,
      }),
    ).resolves.toEqual({ ok: true, skipped: "disabled" });

    await expect(
      ensureLocalStack({
        targetUrl: "https://rakazo.example.com",
        searchFrom: [repo],
        host: fakeHost({ files: repoFiles() }),
      }),
    ).resolves.toEqual({ ok: true, skipped: "not-local" });
  });

  it("skips Compose when the local web origin is already healthy", async () => {
    const host = fakeHost({
      files: repoFiles(),
      fetchJson: async () => ({
        status: 200,
        json: { json: { ok: true, version: "0.1.0" } },
      }),
    });
    await expect(
      ensureLocalStack({ targetUrl: "http://127.0.0.1:5173", searchFrom: [repo], host }),
    ).resolves.toMatchObject({ ok: true, skipped: "already-up", repoRoot: repo });
    expect(host.commands.some((command) => command.args[0] === "compose")).toBe(false);
  });

  it("stops a leftover API from this checkout, then starts Compose", async () => {
    let healthy = false;
    const shortcuts: Array<{ path: string; target: string }> = [];
    const host = fakeHost({
      files: repoFiles(),
      fetchJson: async () =>
        healthy
          ? { status: 200, json: { json: { ok: true, version: "0.1.0" } } }
          : { error: "ECONNREFUSED" },
      run: async (file, args) => {
        if (file === "ss" || (file === "netstat" && args.includes("-lptn"))) {
          return {
            code: 0,
            stdout: 'LISTEN 0 511 127.0.0.1:3100 0.0.0.0:* users:(("node",pid=4242,fd=23))',
            stderr: "",
          };
        }
        if (file.endsWith("docker") && args[0] === "info")
          return { code: 0, stdout: "", stderr: "" };
        if (file.endsWith("docker") && args[0] === "compose") {
          healthy = true;
          return { code: 0, stdout: "Started", stderr: "" };
        }
        return { code: 0, stdout: "", stderr: "" };
      },
      commandLineForPid: async (pid) => (pid === 4242 ? "node /repo/apps/api/dist/index.js" : null),
      writeShortcut: (filePath, details) => {
        shortcuts.push({ path: filePath, target: details.target });
      },
      platform: "linux",
      homedir: "/home/user",
    });
    const result = await ensureLocalStack({
      targetUrl: "http://127.0.0.1:5173",
      searchFrom: [path.join(repo, "apps", "desktop")],
      host,
    });
    expect(result).toEqual({ ok: true, repoRoot: repo });
    expect(host.stopped).toContain(4242);
    const compose = host.commands.find((command) => command.args[0] === "compose");
    expect(compose?.args).toContain("infra/compose/docker-compose.desktop.yml");
    expect(compose?.args).toContain(".env");
    expect(shortcuts).toEqual([]);
  });

  it("writes the Windows shortcut after a successful start", async () => {
    let healthy = false;
    const shortcuts: Array<{ path: string; target: string }> = [];
    const host = fakeHost({
      files: repoFiles(),
      platform: "win32",
      homedir: "C:\\Users\\User",
      fetchJson: async () =>
        healthy
          ? { status: 200, json: { json: { ok: true, version: "0.1.0" } } }
          : { error: "ECONNREFUSED" },
      run: async (file, args) => {
        if (file.toLowerCase().endsWith("docker.exe") || file.endsWith("docker")) {
          if (args[0] === "info") return { code: 0, stdout: "", stderr: "" };
          if (args[0] === "compose") {
            healthy = true;
            return { code: 0, stdout: "", stderr: "" };
          }
        }
        return { code: 0, stdout: "", stderr: "" };
      },
      writeShortcut: (filePath, details) => {
        shortcuts.push({ path: filePath, target: details.target });
      },
    });

    const result = await ensureLocalStack({
      targetUrl: "http://127.0.0.1:5173",
      searchFrom: [repo],
      host,
    });
    expect(result.ok).toBe(true);
    expect(shortcuts[0]?.path).toBe(path.join("C:\\Users\\User", "Desktop", "RocksteadyBot.lnk"));
    expect(shortcuts[0]?.target).toBe(launcher);
  });

  it("explains a missing checkout", async () => {
    await expect(
      ensureLocalStack({
        targetUrl: "http://127.0.0.1:5173",
        searchFrom: ["/tmp/nowhere"],
        host: fakeHost(),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("Could not find the RocksteadyBot checkout"),
    });
  });

  it("retries Compose after a port-bind failure once leftovers are stopped", async () => {
    let attempts = 0;
    let healthy = false;
    const host = fakeHost({
      files: repoFiles(),
      fetchJson: async () =>
        healthy
          ? { status: 200, json: { json: { ok: true, version: "0.1.0" } } }
          : { error: "ECONNREFUSED" },
      run: async (file, args) => {
        if (file.endsWith("docker") && args[0] === "info")
          return { code: 0, stdout: "", stderr: "" };
        if (file.endsWith("docker") && args[0] === "compose") {
          attempts += 1;
          if (attempts === 1) {
            return {
              code: 1,
              stdout: "",
              stderr:
                "ports are not available: bind: Only one usage of each socket address (protocol/network address/port): 0.0.0.0:3100",
            };
          }
          healthy = true;
          return { code: 0, stdout: "", stderr: "" };
        }
        return { code: 0, stdout: "", stderr: "" };
      },
    });

    await expect(
      ensureLocalStack({ targetUrl: "http://127.0.0.1:5173", searchFrom: [repo], host }),
    ).resolves.toEqual({ ok: true, repoRoot: repo });
    expect(attempts).toBe(2);
  });
});

describe("API health", () => {
  it("requires the host /health contract", () => {
    expect(isRakazoApiHealth({ ok: true, runtime: "pi" })).toBe(true);
    expect(isRakazoApiHealth({ ok: true })).toBe(false);
    expect(isRakazoApiHealth({ json: { ok: true, version: "0.1.0" } })).toBe(false);
  });
});

describe("launcher files", () => {
  const root = path.resolve(import.meta.dirname, "../../..");

  it("keeps Compose API and web on loopback, and omits host :3100 from desktop launches", async () => {
    const compose = await readFile(path.join(root, "infra/compose/docker-compose.yml"), "utf8");
    const desktop = await readFile(
      path.join(root, "infra/compose/docker-compose.desktop.yml"),
      "utf8",
    );
    expect(compose).toContain("127.0.0.1:3100:3100");
    expect(compose).toContain("127.0.0.1:5173:5173");
    expect(desktop).toContain("ports: !override []");
    expect(desktop).toContain("127.0.0.1:5173:5173");
  });

  it("points the Windows launcher at Compose then Electron", async () => {
    const cmd = await readFile(path.join(root, "apps/desktop/scripts/open-desktop.cmd"), "utf8");
    expect(cmd).toContain("docker-compose.desktop.yml");
    expect(cmd).toContain("electron.exe");
    expect(cmd).toContain("http://127.0.0.1:5173");
    expect(cmd).toContain("install-desktop-shortcut.ps1");
    expect(cmd).toContain("free-own-ports.ps1");
    expect(cmd).toContain("--remove-orphans");
    const freePorts = await readFile(
      path.join(root, "apps/desktop/scripts/free-own-ports.ps1"),
      "utf8",
    );
    expect(freePorts).toContain("Test-OwnStackProcess");
    expect(freePorts).toContain("taskkill");
  });
});
