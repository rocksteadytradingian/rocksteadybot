import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("welcome", () => {
  it("offers Sign up for a first local account", async () => {
    const source = await readFile(path.join(import.meta.dirname, "Welcome.tsx"), "utf8");
    expect(source).toContain('navigate("/sign-in")');
    expect(source).toContain('navigate("/sign-up")');
  });
});
