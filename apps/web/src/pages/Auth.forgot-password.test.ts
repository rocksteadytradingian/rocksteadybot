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
});
