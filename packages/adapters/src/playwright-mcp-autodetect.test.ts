import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePlaywrightMcp, sanitizeProfileId } from "./playwright-mcp-autodetect.js";

const noPath = async () => null;

describe("resolvePlaywrightMcp", () => {
  it("returns null when no bin is set or on PATH", async () => {
    expect(
      await resolvePlaywrightMcp({ dataDir: "/data" }, { env: {}, lookPath: noPath }),
    ).toBeNull();
  });

  it("uses RAKAZO_PLAYWRIGHT_MCP_BIN when set", async () => {
    const opts = await resolvePlaywrightMcp(
      { dataDir: "/data" },
      { env: { RAKAZO_PLAYWRIGHT_MCP_BIN: "/opt/pw-mcp" }, lookPath: noPath },
    );
    expect(opts?.command).toBe("/opt/pw-mcp");
    expect(opts?.headless).toBe(false);
    expect(opts?.profileDir("bot-9")).toBe(join("/data", "browser-profiles", "bot-9"));
  });

  it("falls back to a PATH candidate", async () => {
    const opts = await resolvePlaywrightMcp(
      { dataDir: "/data" },
      {
        env: {},
        lookPath: async (n) =>
          n === "mcp-server-playwright" ? "/usr/bin/mcp-server-playwright" : null,
      },
    );
    expect(opts?.command).toBe("/usr/bin/mcp-server-playwright");
  });

  it("honours profile dir, extra args, and headless env", async () => {
    const opts = await resolvePlaywrightMcp(
      { dataDir: "/data" },
      {
        env: {
          RAKAZO_PLAYWRIGHT_MCP_BIN: "pw",
          RAKAZO_BROWSER_PROFILE_DIR: "/profiles",
          RAKAZO_PLAYWRIGHT_MCP_ARGS: "--no-sandbox  --viewport-size 1280,800",
          RAKAZO_BROWSER_HEADLESS: "true",
        },
        lookPath: noPath,
      },
    );
    expect(opts?.args).toEqual(["--no-sandbox", "--viewport-size", "1280,800"]);
    expect(opts?.headless).toBe(true);
    expect(opts?.profileDir("bot-1")).toBe(join("/profiles", "bot-1"));
  });
});

describe("sanitizeProfileId", () => {
  it("keeps a profile id to one safe path segment", () => {
    expect(sanitizeProfileId("ws/../etc")).toBe("ws-etc");
    expect(sanitizeProfileId("bot_42-a")).toBe("bot_42-a");
    expect(sanitizeProfileId("///")).toBe("default");
  });
});
