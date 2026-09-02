import { describe, expect, it } from "vitest";
import {
  blockedGoogleConsumerAuthHost,
  connectedPluginsInstruction,
  GOOGLE_CONSUMER_AUTH_INSTRUCTION,
  googleConsumerAuthRefusal,
} from "./google-consumer-auth.js";

describe("google consumer auth policy", () => {
  it("blocks signed-in Google consumer hosts and YouTube auth paths", () => {
    expect(blockedGoogleConsumerAuthHost("https://mail.google.com/mail/u/0/")).toBe(
      "mail.google.com",
    );
    expect(blockedGoogleConsumerAuthHost("accounts.google.com")).toBe("accounts.google.com");
    expect(blockedGoogleConsumerAuthHost("https://www.gmail.com")).toBe("gmail.com");
    expect(blockedGoogleConsumerAuthHost("https://calendar.google.com/calendar")).toBe(
      "calendar.google.com",
    );
    expect(blockedGoogleConsumerAuthHost("https://studio.youtube.com")).toBe("studio.youtube.com");
    expect(blockedGoogleConsumerAuthHost("https://www.youtube.com/upload")).toBe("youtube.com");
    expect(blockedGoogleConsumerAuthHost("https://business.google.com/posts")).toBe(
      "business.google.com",
    );
    expect(blockedGoogleConsumerAuthHost("https://docs.google.com/document/d/abc")).toBe(
      "docs.google.com",
    );
  });

  it("allows public Google Search and YouTube watch pages", () => {
    expect(blockedGoogleConsumerAuthHost("https://www.google.com/search?q=gmail")).toBeNull();
    expect(blockedGoogleConsumerAuthHost("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(blockedGoogleConsumerAuthHost("https://github.com/login")).toBeNull();
    expect(blockedGoogleConsumerAuthHost("notes/todo.md")).toBeNull();
  });

  it("refuses with an OAuth-plugin instruction", () => {
    const message = googleConsumerAuthRefusal("https://mail.google.com");
    expect(message).toContain("Blocked");
    expect(message).toContain("plugin");
    expect(googleConsumerAuthRefusal("https://www.google.com")).toBeNull();
  });

  it("steers plugin use away from the computer browser", () => {
    expect(GOOGLE_CONSUMER_AUTH_INSTRUCTION).toContain("plugin");
    expect(connectedPluginsInstruction([])).toContain("Do not sign into Google");
    expect(
      connectedPluginsInstruction([
        { displayName: "Gmail", connectorId: "composio", provider: "gmail" },
      ]),
    ).toContain("Never operate the same apps by driving their consumer websites");
  });
});
