import { describe, expect, it } from "vitest";
import { identityDocumentByPath } from "./IdentityFilesEditor";

describe("identityDocumentByPath", () => {
  it("matches the file basename ignoring folders and case", () => {
    const soul = {
      id: "1",
      scope: "bot" as const,
      botId: "bot-1",
      path: "SOUL.md",
      content: "Speak plainly.",
      revision: 1,
      updatedAt: "2026-08-31T00:00:00.000Z",
    };
    expect(identityDocumentByPath([soul], "soul.md")?.id).toBe("1");
    expect(identityDocumentByPath([soul], "IDENTITY.md")).toBeUndefined();
  });
});
