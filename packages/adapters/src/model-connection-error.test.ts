import { describe, expect, it } from "vitest";
import { humanizeModelConnectionError } from "./model-connection-error.js";

describe("humanizeModelConnectionError", () => {
  it("explains a local server that is not running", () => {
    expect(
      humanizeModelConnectionError("Connection error.", {
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:1234/v1",
      }),
    ).toBe(
      "Could not reach the local model server at http://127.0.0.1:1234/v1. Start it and try again.",
    );
  });

  it("maps cloud connection failures without exposing the SDK text", () => {
    expect(humanizeModelConnectionError("Connection error.", { provider: "anthropic" })).toBe(
      "Could not reach Anthropic. Check your network and try again.",
    );
    expect(humanizeModelConnectionError("Connection error.", { provider: "tokenrouter" })).toBe(
      "Could not reach TokenRouter. Check your network and try again.",
    );
  });

  it("maps 429 payloads to a rate-limit instruction", () => {
    expect(
      humanizeModelConnectionError(
        '429 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
        { provider: "anthropic" },
      ),
    ).toBe("This model is rate-limited right now. Wait a moment and try again.");
  });

  it("leaves unrelated provider errors unchanged", () => {
    expect(humanizeModelConnectionError("WebSocket closed 1006")).toBe("WebSocket closed 1006");
  });
});
