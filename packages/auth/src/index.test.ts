import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { blockedAuthPaths } from "./index.js";

describe("auth policy", () => {
  it("blocks invitation and org-creation paths in version 1", () => {
    expect(blockedAuthPaths.some((p) => p.includes("invite"))).toBe(true);
    expect(blockedAuthPaths.some((p) => p.includes("create"))).toBe(true);
  });

  it("does not mark cookies Secure on the local HTTP origin", async () => {
    const source = await readFile(path.join(import.meta.dirname, "index.ts"), "utf8");
    expect(source).toContain('useSecureCookies: env.webOrigin.startsWith("https://")');
  });
});
