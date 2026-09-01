import { describe, expect, it } from "vitest";
import {
  BOT_IDENTITY_PATH,
  botIdentityTemplate,
  clampIdentityFileContent,
  IDENTITY_FILE_MAX_CHARS,
  identityKindFor,
  identityPromptRank,
  isIdentityFile,
  rememberScopeForPath,
  SOUL_IDENTITY_PATH,
  soulIdentityTemplate,
  USER_IDENTITY_PATH,
  userIdentityTemplate,
} from "./identity-files.js";

describe("identityKindFor", () => {
  it("binds each file to its canonical scope", () => {
    expect(identityKindFor(USER_IDENTITY_PATH, "user")).toBe("user");
    expect(identityKindFor("user.md", "user")).toBe("user");
    expect(identityKindFor("notes/USER.md", "user")).toBe("user");
    expect(identityKindFor(BOT_IDENTITY_PATH, "bot")).toBe("identity");
    expect(identityKindFor(SOUL_IDENTITY_PATH, "bot")).toBe("soul");
  });

  it("ignores identity filenames in the wrong scope", () => {
    expect(identityKindFor(USER_IDENTITY_PATH, "bot")).toBeNull();
    expect(identityKindFor(BOT_IDENTITY_PATH, "user")).toBeNull();
    expect(identityKindFor(SOUL_IDENTITY_PATH, "user")).toBeNull();
    expect(identityKindFor("MEMORY.md", "user")).toBeNull();
  });
});

describe("identityPromptRank", () => {
  it("orders user, role, then voice", () => {
    expect(identityPromptRank(USER_IDENTITY_PATH, "user")).toBeLessThan(
      identityPromptRank(BOT_IDENTITY_PATH, "bot"),
    );
    expect(identityPromptRank(BOT_IDENTITY_PATH, "bot")).toBeLessThan(
      identityPromptRank(SOUL_IDENTITY_PATH, "bot"),
    );
  });
});

describe("rememberScopeForPath", () => {
  it("defaults USER.md to user scope and everything else to bot", () => {
    expect(rememberScopeForPath(USER_IDENTITY_PATH)).toBe("user");
    expect(rememberScopeForPath(SOUL_IDENTITY_PATH)).toBe("bot");
    expect(rememberScopeForPath("MEMORY.md")).toBe("bot");
  });

  it("honors an explicit scope", () => {
    expect(rememberScopeForPath(USER_IDENTITY_PATH, "bot")).toBe("bot");
    expect(rememberScopeForPath("MEMORY.md", "user")).toBe("user");
  });
});

describe("templates", () => {
  it("seeds USER.md and SOUL.md with empty slots", () => {
    expect(userIdentityTemplate()).toContain("Role:");
    expect(soulIdentityTemplate()).toContain("Tone:");
    expect(isIdentityFile(USER_IDENTITY_PATH, "user")).toBe(true);
  });

  it("puts the bot name and job into IDENTITY.md", () => {
    const content = botIdentityTemplate({ name: "Kai", title: "Trusted advisor" });
    expect(content).toContain("# Kai");
    expect(content).toContain("Job: Trusted advisor");
  });
});

describe("clampIdentityFileContent", () => {
  it("keeps a short file intact and clips a long one", () => {
    expect(clampIdentityFileContent("hello")).toBe("hello");
    const clamped = clampIdentityFileContent("x".repeat(IDENTITY_FILE_MAX_CHARS + 50));
    expect(clamped).toHaveLength(IDENTITY_FILE_MAX_CHARS);
  });
});
