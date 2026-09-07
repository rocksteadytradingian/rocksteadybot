import { describe, expect, it } from "vitest";
import { composioProjectKeyStatus } from "./composio-project-key.js";

describe("composioProjectKeyStatus", () => {
  it("prefers a saved account key over the server env key", () => {
    expect(composioProjectKeyStatus(true, "ak_server")).toEqual({
      configured: true,
      source: "user",
    });
    expect(composioProjectKeyStatus(false, "ak_server")).toEqual({
      configured: true,
      source: "server",
    });
    expect(composioProjectKeyStatus(false, undefined)).toEqual({
      configured: false,
      source: "none",
    });
  });
});
