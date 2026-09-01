import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir as osHomedir } from "node:os";
import path from "node:path";
import { PRODUCT_NAME } from "@rakazo/contracts";
import { isManagedLocalWebUrl, isRakazoHealth, normalizeServerUrl } from "./setup-config.js";

export const COMPOSE_FILE = path.join("infra", "compose", "docker-compose.yml");
export const COMPOSE_DESKTOP_FILE = path.join("infra", "compose", "docker-compose.desktop.yml");
export const OPEN_DESKTOP_SCRIPT = path.join("apps", "desktop", "scripts", "open-desktop.cmd");
export const LOCAL_API_PORT = 3100;
export const LOCAL_WEB_PORT = 5173;
export const DESKTOP_SHORTCUT_NAME = `${PRODUCT_NAME}.lnk`;

const WEB_HEALTH_PATH = "/rpc/health";
const COMPOSE_MARKER = path.join("infra", "compose", "docker-compose.yml");
const WORKSPACE_MARKER = "pnpm-workspace.yaml";

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface FetchResult {
  status: number;
  json: unknown;
}

export interface DesktopShortcutDetails {
  target: string;
  cwd: string;
  args: string;
  description: string;
  icon?: string;
  iconIndex?: number;
}

export interface LocalStackHost {
  exists(filePath: string): boolean;
  fetchJson(
    url: string,
    init: { method: string; headers?: Record<string, string>; body?: string; timeoutMs: number },
  ): Promise<FetchResult | { error: string }>;
  run(
    file: string,
    args: string[],
    opts?: { cwd?: string; timeoutMs?: number },
  ): Promise<CommandResult>;
  commandLineForPid(pid: number): Promise<string | null>;
  stopPid(pid: number): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
  platform: NodeJS.Platform;
  pathEnv: string;
  env: NodeJS.Dict<string>;
  homedir: string;
  selfPid: number;
  writeShortcut?(filePath: string, details: DesktopShortcutDetails): void;
  startDockerDesktop?(): Promise<void>;
}

export type LocalStackResult =
  | { ok: true; skipped?: "disabled" | "not-local" | "already-up"; repoRoot?: string }
  | { ok: false; error: string };

function envFlagOn(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false" && normalized !== "off";
}

export function localStackAutoStartEnabled(env: NodeJS.Dict<string>): boolean {
  if (envFlagOn(env.RAKAZO_DISABLE_LOCAL_STACK)) return false;
  // CI must never block the Electron window on Docker Compose.
  if (envFlagOn(env.CI)) return false;
  if (env.RAKAZO_PERFORMANCE_USER_DATA?.trim()) return false;
  const webUrl = env.RAKAZO_WEB_URL?.trim();
  return webUrl === undefined || webUrl === "";
}

export function localStackAutoConnectOnFirstRun(env: NodeJS.Dict<string>): boolean {
  return localStackAutoStartEnabled(env) && env.RAKAZO_FORCE_SETUP !== "1";
}

export function isRakazoApiHealth(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { ok?: unknown; runtime?: unknown };
  return record.ok === true && typeof record.runtime === "string";
}

export function isPortConflictOutput(text: string): boolean {
  return /port is already allocated|only one usage of each socket address|address already in use|bind:.*already/i.test(
    text,
  );
}

export function looksLikeRepoRoot(dir: string, exists: (filePath: string) => boolean): boolean {
  return exists(path.join(dir, COMPOSE_MARKER)) && exists(path.join(dir, WORKSPACE_MARKER));
}

export function findRepoRoot(
  starts: Array<string | undefined>,
  exists: (filePath: string) => boolean,
): string | null {
  const seen = new Set<string>();
  for (const start of starts) {
    if (start === undefined || start.trim() === "") continue;
    let current = path.resolve(start);
    for (let i = 0; i < 8; i += 1) {
      if (seen.has(current)) break;
      seen.add(current);
      if (looksLikeRepoRoot(current, exists)) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

export function localPortFromAddress(address: string): number | null {
  const ipv6 = address.match(/\]:(\d+)$/);
  if (ipv6) {
    const port = Number(ipv6[1]);
    return Number.isInteger(port) ? port : null;
  }
  const index = address.lastIndexOf(":");
  if (index < 0) return null;
  const port = Number(address.slice(index + 1));
  return Number.isInteger(port) ? port : null;
}

export function listeningPidsFromNetstat(output: string, port: number): number[] {
  const pids = new Set<number>();
  for (const line of output.split(/\r?\n/)) {
    if (!/LISTENING/i.test(line)) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const local = parts[1] ?? "";
    const pid = Number(parts[parts.length - 1]);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (localPortFromAddress(local) === port) pids.add(pid);
  }
  return [...pids];
}

export function listeningPidsFromSs(output: string): number[] {
  const pids = new Set<number>();
  for (const match of output.matchAll(/pid=(\d+)/g)) {
    const pid = Number(match[1]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

/** Host leftovers from this checkout. Never matches Docker's port proxy or Electron itself. */
export function isOwnStackProcess(commandLine: string): boolean {
  const text = commandLine.toLowerCase();
  if (
    text.includes("docker-proxy") ||
    text.includes("com.docker") ||
    text.includes("vpnkit") ||
    text.includes("docker desktop")
  ) {
    return false;
  }
  if (/(^|[/\\])electron(\.exe)?(\s|$)/i.test(commandLine) && !/@rakazo\/api\b/.test(commandLine)) {
    return false;
  }
  return (
    /@rakazo\/(api|web|worker)\b/.test(commandLine) ||
    /apps[/\\](api|web)[/\\]/.test(commandLine) ||
    /pnpm.*--filter\s+@rakazo\/(api|web|worker)/.test(commandLine) ||
    (/vite/.test(text) && /rakazo|rckbot|rocksteady/.test(text))
  );
}

export function composeFileFlags(envFileExists: boolean): string[] {
  const args = ["compose"];
  if (envFileExists) args.push("--env-file", ".env");
  args.push("-f", COMPOSE_FILE, "-f", COMPOSE_DESKTOP_FILE);
  return args;
}

export function composeUpArgs(envFileExists: boolean): string[] {
  return [...composeFileFlags(envFileExists), "up", "-d", "--remove-orphans"];
}

export function composeForceRecreateWebArgs(envFileExists: boolean): string[] {
  return [
    ...composeFileFlags(envFileExists),
    "up",
    "-d",
    "--force-recreate",
    "--no-deps",
    "web",
    "api",
  ];
}

export function composeCpArgs(
  envFileExists: boolean,
  hostPath: string,
  containerPath: string,
): string[] {
  return [...composeFileFlags(envFileExists), "cp", hostPath, containerPath];
}

export function composeRestartArgs(envFileExists: boolean, service: string): string[] {
  return [...composeFileFlags(envFileExists), "restart", service];
}

export function composeImageGrepArgs(envFileExists: boolean): string[] {
  return [
    ...composeFileFlags(envFileExists),
    "run",
    "--rm",
    "--no-deps",
    "--no-build",
    "--entrypoint",
    "grep",
    "web",
    "Forgot password?",
    "/app/apps/web/dist/index.html",
  ];
}

export function composeBuildWebArgs(envFileExists: boolean): string[] {
  return [...composeFileFlags(envFileExists), "build", "web"];
}

export const WEB_CHECKOUT_COPIES: Array<{ hostPath: string; destination: string }> = [
  { hostPath: "apps/web/src/.", destination: "web:/app/apps/web/src/" },
  { hostPath: "apps/web/index.html", destination: "web:/app/apps/web/index.html" },
  {
    hostPath: "apps/desktop/scripts/inject-forgot-password-fallback.mjs",
    destination: "web:/tmp/inject-forgot-password-fallback.mjs",
  },
];

export const API_CHECKOUT_COPIES: Array<{ hostPath: string; destination: string }> = [
  { hostPath: "apps/api/src/.", destination: "api:/app/apps/api/src/" },
  { hostPath: "packages/auth/src/.", destination: "api:/app/packages/auth/src/" },
  { hostPath: "packages/adapters/src/.", destination: "api:/app/packages/adapters/src/" },
];

export function checkoutCopyExists(
  repoRoot: string,
  hostPath: string,
  exists: (filePath: string) => boolean,
): boolean {
  const relative = hostPath.endsWith("/.") ? hostPath.slice(0, -2) : hostPath;
  return exists(path.join(repoRoot, ...relative.split("/")));
}

export function shouldRefreshWebFromCheckout(
  repoRoot: string,
  exists: (filePath: string) => boolean,
): boolean {
  return checkoutCopyExists(repoRoot, "apps/web/src/.", exists);
}

export function desktopShortcutPath(homedir: string): string {
  return path.join(homedir, "Desktop", DESKTOP_SHORTCUT_NAME);
}

export function desktopShortcutDetails(repoRoot: string): DesktopShortcutDetails | null {
  const target = path.join(repoRoot, OPEN_DESKTOP_SCRIPT);
  const icon = path.join(repoRoot, "apps", "desktop", "assets", "icon.ico");
  return {
    target,
    cwd: repoRoot,
    args: "",
    description: `Start ${PRODUCT_NAME}`,
    icon,
    iconIndex: 0,
  };
}

export function whichOnPath(
  command: string,
  pathEnv: string,
  platform: NodeJS.Platform,
  exists: (filePath: string) => boolean,
): string | null {
  const delimiter = platform === "win32" ? ";" : ":";
  const extensions = platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const dir of pathEnv.split(delimiter)) {
    if (dir.trim() === "") continue;
    for (const extension of extensions) {
      const candidate = path.join(dir, `${command}${extension}`);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

export function resolveDockerBin(
  platform: NodeJS.Platform,
  pathEnv: string,
  exists: (filePath: string) => boolean,
): string | null {
  const fromPath = whichOnPath("docker", pathEnv, platform, exists);
  if (fromPath !== null) return fromPath;
  if (platform === "win32") {
    const candidate = path.join(
      process.env.ProgramFiles ?? "C:\\Program Files",
      "Docker",
      "Docker",
      "resources",
      "bin",
      "docker.exe",
    );
    if (exists(candidate)) return candidate;
  }
  return null;
}

export function windowsDockerDesktopPath(exists: (filePath: string) => boolean): string | null {
  const candidate = path.join(
    process.env.ProgramFiles ?? "C:\\Program Files",
    "Docker",
    "Docker",
    "Docker Desktop.exe",
  );
  return exists(candidate) ? candidate : null;
}

const FETCH_TIMEOUT_MS = 4_000;
const COMPOSE_TIMEOUT_MS = 180_000;
const COPY_TIMEOUT_MS = 60_000;
const WEB_BUILD_TIMEOUT_MS = 360_000;
const IMAGE_BUILD_TIMEOUT_MS = 600_000;
const DOCKER_INFO_TIMEOUT_MS = 20_000;
const DOCKER_DESKTOP_WAIT_MS = 90_000;
const HEALTH_WAIT_MS = 180_000;
const HEALTH_POLL_MS = 2_000;

export async function ensureLocalStack(input: {
  targetUrl: string;
  searchFrom: Array<string | undefined>;
  host: LocalStackHost;
}): Promise<LocalStackResult> {
  const { host } = input;
  if (!localStackAutoStartEnabled(host.env)) return { ok: true, skipped: "disabled" };

  const target = normalizeServerUrl(input.targetUrl) ?? input.targetUrl;
  if (!isManagedLocalWebUrl(target)) return { ok: true, skipped: "not-local" };

  const repoRoot = findRepoRoot(input.searchFrom, (file) => host.exists(file));
  const docker = resolveDockerBin(host.platform, host.pathEnv, (file) => host.exists(file));
  const alreadyUp = await webIsHealthy(host, target);

  if (repoRoot === null || docker === null) {
    if (alreadyUp) {
      if (repoRoot !== null) installShortcut(host, repoRoot);
      return { ok: true, skipped: "already-up", repoRoot: repoRoot ?? undefined };
    }
    if (repoRoot === null) {
      return {
        ok: false,
        error:
          "Could not find the RocksteadyBot checkout (infra/compose/docker-compose.yml). Open the app from that folder once, or set RAKAZO_REPO_ROOT.",
      };
    }
    return {
      ok: false,
      error: "Docker is not installed. Install Docker Desktop, then open this app again.",
    };
  }

  const daemon = await ensureDockerDaemon(host, docker);
  if (!daemon.ok) return daemon;

  await stopOwnListeners(host, LOCAL_API_PORT);
  await stopOwnListeners(host, LOCAL_WEB_PORT);

  const envFile = host.exists(path.join(repoRoot, ".env"));
  const compose = await host.run(docker, composeUpArgs(envFile), {
    cwd: repoRoot,
    timeoutMs: COMPOSE_TIMEOUT_MS,
  });
  if (compose.code !== 0) {
    const output = `${compose.stdout}\n${compose.stderr}\n${compose.error ?? ""}`;
    if (isPortConflictOutput(output)) {
      await stopOwnListeners(host, LOCAL_API_PORT);
      await stopOwnListeners(host, LOCAL_WEB_PORT);
      const retry = await host.run(docker, composeUpArgs(envFile), {
        cwd: repoRoot,
        timeoutMs: COMPOSE_TIMEOUT_MS,
      });
      if (retry.code !== 0) {
        return {
          ok: false,
          error: portConflictMessage(retry.stdout, retry.stderr, retry.error),
        };
      }
    } else {
      return {
        ok: false,
        error: composeFailureMessage(output),
      };
    }
  }

  await rebuildWebImageIfStale(host, docker, repoRoot, envFile);
  await refreshWebFromCheckout(host, docker, repoRoot, envFile);

  const ready = await waitForWebHealth(host, target);
  if (!ready) {
    return {
      ok: false,
      error:
        "The local stack did not become ready. Start Docker Desktop if it is stopped, then open this app again.",
    };
  }

  installShortcut(host, repoRoot);
  return { ok: true, repoRoot };
}

function portConflictMessage(stdout: string, stderr: string, error?: string) {
  const output = `${stdout}\n${stderr}\n${error ?? ""}`;
  if (/5173/.test(output)) {
    return "Port 5173 is already in use by another app. Close that app, then open RocksteadyBot again.";
  }
  if (/3100/.test(output)) {
    return "Port 3100 is already in use by another app. Close that app, then open RocksteadyBot again.";
  }
  return "Docker could not publish a local port. Close the app using 5173 or 3100, then try again.";
}

function composeFailureMessage(output: string) {
  if (/cannot connect to the docker daemon|error during connect|pipe.*docker/i.test(output)) {
    return "Docker Desktop is not running. Start it, then open this app again.";
  }
  return "Docker Compose could not start the local stack. Check Docker Desktop, then try again.";
}

async function ensureDockerDaemon(host: LocalStackHost, docker: string): Promise<LocalStackResult> {
  if (await dockerInfoOk(host, docker)) return { ok: true };

  if (host.platform === "win32" && host.startDockerDesktop) {
    try {
      await host.startDockerDesktop();
    } catch {
      // Opening Docker Desktop is best-effort; the wait below still reports if it never comes up.
    }
    const deadline = host.now() + DOCKER_DESKTOP_WAIT_MS;
    while (host.now() < deadline) {
      await host.sleep(HEALTH_POLL_MS);
      if (await dockerInfoOk(host, docker)) return { ok: true };
    }
  }

  return {
    ok: false,
    error: "Docker Desktop is not running. Start it, then open this app again.",
  };
}

async function dockerInfoOk(host: LocalStackHost, docker: string): Promise<boolean> {
  const info = await host.run(docker, ["info"], { timeoutMs: DOCKER_INFO_TIMEOUT_MS });
  return info.code === 0;
}

async function webIsHealthy(host: LocalStackHost, origin: string): Promise<boolean> {
  const response = await host.fetchJson(`${origin}${WEB_HEALTH_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: {} }),
    timeoutMs: FETCH_TIMEOUT_MS,
  });
  if ("error" in response) return false;
  return response.status < 300 && isRakazoHealth(response.json);
}

async function rebuildWebImageIfStale(
  host: LocalStackHost,
  docker: string,
  repoRoot: string,
  envFileExists: boolean,
): Promise<void> {
  if (!shouldRefreshWebFromCheckout(repoRoot, (file) => host.exists(file))) return;
  const grep = await host.run(docker, composeImageGrepArgs(envFileExists), {
    cwd: repoRoot,
    timeoutMs: COPY_TIMEOUT_MS,
  });
  if (grep.code === 0) return;
  const built = await host.run(docker, composeBuildWebArgs(envFileExists), {
    cwd: repoRoot,
    timeoutMs: IMAGE_BUILD_TIMEOUT_MS,
  });
  if (built.code !== 0) return;
  await host.run(docker, composeUpArgs(envFileExists), {
    cwd: repoRoot,
    timeoutMs: COMPOSE_TIMEOUT_MS,
  });
}

export async function refreshWebFromCheckout(
  host: LocalStackHost,
  docker: string,
  repoRoot: string,
  envFileExists: boolean,
): Promise<void> {
  if (!shouldRefreshWebFromCheckout(repoRoot, (file) => host.exists(file))) return;

  const runCompose = (args: string[], timeoutMs: number) =>
    host.run(docker, args, { cwd: repoRoot, timeoutMs });

  for (const copy of WEB_CHECKOUT_COPIES) {
    if (!checkoutCopyExists(repoRoot, copy.hostPath, (file) => host.exists(file))) continue;
    await runCompose(
      composeCpArgs(envFileExists, copy.hostPath, copy.destination),
      COPY_TIMEOUT_MS,
    );
  }
  for (const copy of API_CHECKOUT_COPIES) {
    if (!checkoutCopyExists(repoRoot, copy.hostPath, (file) => host.exists(file))) continue;
    try {
      await runCompose(
        composeCpArgs(envFileExists, copy.hostPath, copy.destination),
        COPY_TIMEOUT_MS,
      );
    } catch {
      // Password reset can still work against the image API; the sign-in link does not need it.
    }
  }

  await runCompose(
    [
      ...composeFileFlags(envFileExists),
      "exec",
      "-T",
      "-u",
      "root",
      "web",
      "chown",
      "-R",
      "node:node",
      "/app/apps/web",
    ],
    COPY_TIMEOUT_MS,
  );
  if (
    checkoutCopyExists(
      repoRoot,
      "apps/desktop/scripts/inject-forgot-password-fallback.mjs",
      (file) => host.exists(file),
    )
  ) {
    await runCompose(
      [
        ...composeFileFlags(envFileExists),
        "exec",
        "-T",
        "-u",
        "root",
        "web",
        "node",
        "/tmp/inject-forgot-password-fallback.mjs",
      ],
      COPY_TIMEOUT_MS,
    );
  }

  await runCompose(
    [
      ...composeFileFlags(envFileExists),
      "exec",
      "-T",
      "-u",
      "node",
      "web",
      "bash",
      "-lc",
      "RAKAZO_ALLOW_DEV_SECRETS=1 pnpm --filter @rakazo/web build",
    ],
    WEB_BUILD_TIMEOUT_MS,
  );
  await runCompose(composeRestartArgs(envFileExists, "web"), COPY_TIMEOUT_MS);
  await runCompose(composeRestartArgs(envFileExists, "api"), COPY_TIMEOUT_MS);
}

async function waitForWebHealth(host: LocalStackHost, origin: string): Promise<boolean> {
  const deadline = host.now() + HEALTH_WAIT_MS;
  while (host.now() < deadline) {
    if (await webIsHealthy(host, origin)) return true;
    await host.sleep(HEALTH_POLL_MS);
  }
  return webIsHealthy(host, origin);
}

async function stopOwnListeners(host: LocalStackHost, port: number): Promise<void> {
  const pids = await listeningPids(host, port);
  for (const pid of pids) {
    if (pid === host.selfPid) continue;
    const commandLine = await host.commandLineForPid(pid);
    if (commandLine === null || !isOwnStackProcess(commandLine)) continue;
    try {
      await host.stopPid(pid);
    } catch {
      // The process may have exited between the port scan and the stop.
    }
  }
}

async function listeningPids(host: LocalStackHost, port: number): Promise<number[]> {
  if (host.platform === "win32") {
    const result = await host.run("netstat", ["-ano", "-p", "tcp"], { timeoutMs: 8_000 });
    return listeningPidsFromNetstat(`${result.stdout}\n${result.stderr}`, port);
  }
  const result = await host.run("ss", ["-lptn", `sport = :${port}`], { timeoutMs: 8_000 });
  if (result.code === 0) return listeningPidsFromSs(`${result.stdout}\n${result.stderr}`);
  const fallback = await host.run("netstat", ["-lptn"], { timeoutMs: 8_000 });
  return listeningPidsFromNetstat(`${fallback.stdout}\n${fallback.stderr}`, port);
}

function installShortcut(host: LocalStackHost, repoRoot: string) {
  if (host.platform !== "win32" || host.writeShortcut === undefined) return;
  const details = desktopShortcutDetails(repoRoot);
  if (details === null) return;
  if (!host.exists(details.target)) return;
  try {
    host.writeShortcut(desktopShortcutPath(host.homedir), details);
  } catch {
    // Creating the shortcut is convenience, not required to open the app this time.
  }
}

export function createNodeLocalStackHost(overrides: Partial<LocalStackHost> = {}): LocalStackHost {
  const platform = overrides.platform ?? process.platform;
  const host: LocalStackHost = {
    exists: (filePath) => existsSync(filePath),
    fetchJson: async (url, init) => {
      try {
        const response = await fetch(url, {
          method: init.method,
          headers: init.headers,
          body: init.body,
          signal: AbortSignal.timeout(init.timeoutMs),
        });
        let json: unknown = null;
        try {
          json = await response.json();
        } catch {
          json = null;
        }
        return { status: response.status, json };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
    run: (file, args, opts) => runCommand(file, args, opts),
    commandLineForPid: (pid) => commandLineForPid(platform, pid),
    stopPid: (pid) => stopPid(platform, pid),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    platform,
    pathEnv: process.env.PATH ?? "",
    env: process.env,
    homedir: osHomedir(),
    selfPid: process.pid,
    startDockerDesktop: async () => {
      const desktop = windowsDockerDesktopPath((file) => existsSync(file));
      if (desktop === null) return;
      const child = spawn(desktop, [], { detached: true, stdio: "ignore", windowsHide: true });
      child.unref();
    },
    ...overrides,
  };
  return host;
}

function runCommand(
  file: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: opts.cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timeout = setTimeout(() => {
      child.kill();
      resolve({ code: 1, stdout, stderr, error: "Timed out running a local command." });
    }, opts.timeoutMs ?? 30_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      resolve({
        code: 1,
        stdout,
        stderr,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function commandLineForPid(platform: NodeJS.Platform, pid: number): Promise<string | null> {
  if (platform === "win32") {
    const result = await runCommand(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
      ],
      { timeoutMs: 8_000 },
    );
    const line = result.stdout.trim();
    return line === "" ? null : line;
  }
  const result = await runCommand("ps", ["-p", String(pid), "-o", "args="], { timeoutMs: 5_000 });
  const line = result.stdout.trim();
  return line === "" ? null : line;
}

async function stopPid(platform: NodeJS.Platform, pid: number): Promise<void> {
  if (platform === "win32") {
    await runCommand("taskkill", ["/PID", String(pid), "/F"], { timeoutMs: 8_000 });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}
