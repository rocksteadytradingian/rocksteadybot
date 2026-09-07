import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const delayMs = Number(process.argv[2]);
const tsxCli = process.argv[3];
const entry = process.argv[4];
const hiddenStart = path.join(path.dirname(fileURLToPath(import.meta.url)), "hidden-start.vbs");

if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 30_000) process.exit(1);
if (!tsxCli || entry !== "src/index.ts") process.exit(1);

const port = Number(process.env.API_PORT ?? 3100);
const healthUrl = `http://127.0.0.1:${Number.isInteger(port) && port > 0 ? port : 3100}/health`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function healthOk() {
  try {
    const response = await fetch(healthUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function spawnApi() {
  // Windows detached node always gets a console; the VBS starter hides it.
  if (process.platform === "win32" && existsSync(hiddenStart)) {
    const child = spawn(
      "wscript.exe",
      ["//nologo", hiddenStart, process.cwd(), process.execPath, tsxCli, entry],
      { stdio: "ignore", windowsHide: true, env: process.env },
    );
    child.unref();
    return;
  }
  const child = spawn(process.execPath, [tsxCli, entry], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: process.env,
  });
  child.unref();
}

await sleep(delayMs);
const deadline = Date.now() + 10_000;
while (Date.now() < deadline) {
  if (await healthOk()) process.exit(0);
  await sleep(200);
}
if (await healthOk()) process.exit(0);

spawnApi();
