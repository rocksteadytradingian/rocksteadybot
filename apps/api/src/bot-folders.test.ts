import { describe, expect, it } from "vitest";
import { normalizeHostFolderPath } from "./router.js";

describe("normalizeHostFolderPath", () => {
  it("keeps a POSIX absolute path and trims a trailing slash", () => {
    expect(normalizeHostFolderPath("/Users/me/projects/")).toBe("/Users/me/projects");
  });

  it("collapses '.' segments", () => {
    expect(normalizeHostFolderPath("/Users/me/./projects")).toBe("/Users/me/projects");
  });

  it("keeps a Windows absolute path", () => {
    expect(normalizeHostFolderPath("C:\\Users\\me\\projects")).toBe("C:\\Users\\me\\projects");
  });

  it("rejects a relative path", () => {
    expect(() => normalizeHostFolderPath("projects/thing")).toThrow(/absolute/i);
  });

  it("rejects an empty path", () => {
    expect(() => normalizeHostFolderPath("   ")).toThrow(/required/i);
  });

  it("rejects upward traversal", () => {
    expect(() => normalizeHostFolderPath("/Users/me/../root")).toThrow(/\.\./);
  });

  it("rejects a filesystem root", () => {
    expect(() => normalizeHostFolderPath("/")).toThrow(/root/i);
  });
});
