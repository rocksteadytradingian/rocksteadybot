import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("sign-in Forgot password control", () => {
  it("is a real link on the sign-in form, not only a translation id", async () => {
    const source = await readFile(path.join(import.meta.dirname, "Auth.tsx"), "utf8");
    expect(source).toContain('to="/forgot-password"');
    expect(source).toContain("Forgot password?");
    expect(source).toMatch(/Forgot password\?[\s\S]*Don’t have an account\?/);
  });

  it("uses the cataloged unreachable-server copy so production Lingui does not show ROjpWW", async () => {
    const source = await readFile(path.join(import.meta.dirname, "Auth.tsx"), "utf8");
    expect(source).toContain("Can't reach the server.");
    expect(source).not.toMatch(/Can't reach the server`/);
    expect(source).toContain("Invalid email or password");
  });

  it("keeps a document fallback if the preview JS is still stale", async () => {
    const html = await readFile(path.join(import.meta.dirname, "../../index.html"), "utf8");
    expect(html).toContain('id="rk-forgot-password"');
    expect(html).toContain('href="/forgot-password"');
    expect(html).toContain("Forgot password?");
  });
});
