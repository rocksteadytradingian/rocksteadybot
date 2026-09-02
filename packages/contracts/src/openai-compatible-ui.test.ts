import { describe, expect, it } from "vitest";
import {
  openAiCompatibleConnectReady,
  openAiCompatibleProbeSuccessMessage,
  pinActiveModelProviders,
  selectProviderCredential,
  tokenRouterConnectReady,
} from "./openai-compatible-ui.js";

describe("openAiCompatibleConnectReady", () => {
  it("requires a successful probe for new connections", () => {
    expect(
      openAiCompatibleConnectReady({
        baseUrl: "http://127.0.0.1:8000/v1",
        modelId: "qwen",
        probedBaseUrl: "http://127.0.0.1:8000/v1",
      }),
    ).toBe(true);
    expect(
      openAiCompatibleConnectReady({
        baseUrl: "http://127.0.0.1:8000/v1",
        modelId: "qwen",
        probedBaseUrl: null,
      }),
    ).toBe(false);
  });

  it("guides manual entry when a successful probe lists no models", () => {
    expect(openAiCompatibleProbeSuccessMessage(0)).toBe("Server found. Enter a model name.");
  });

  it("allows reconnecting when the stored endpoint is unchanged", () => {
    expect(
      openAiCompatibleConnectReady({
        baseUrl: "http://127.0.0.1:8000/v1",
        modelId: "qwen",
        probedBaseUrl: null,
        storedBaseUrl: "http://127.0.0.1:8000/v1",
      }),
    ).toBe(true);
  });
});

describe("selectProviderCredential", () => {
  it("prefers the connected OpenAI-compatible row that still has a server URL", () => {
    expect(
      selectProviderCredential(
        [
          {
            provider: "openai-compatible",
            isDefault: true,
            modelId: "stale",
          },
          {
            provider: "openai-compatible",
            isDefault: true,
            baseUrl: "http://127.0.0.1:1234/v1",
            modelId: "bonsai",
          },
        ],
        "openai-compatible",
      ),
    ).toMatchObject({
      baseUrl: "http://127.0.0.1:1234/v1",
      modelId: "bonsai",
    });
  });
});

describe("pinActiveModelProviders", () => {
  it("keeps the active connected provider visible at the top of the list", () => {
    expect(
      pinActiveModelProviders(
        [{ id: "amazon-bedrock" }, { id: "anthropic" }, { id: "openai-compatible" }],
        {
          activeProvider: "openai-compatible",
          connectedProviders: ["anthropic", "openai-compatible"],
        },
      ).map((entry) => entry.id),
    ).toEqual(["openai-compatible", "anthropic", "amazon-bedrock"]);
  });
});

describe("tokenRouterConnectReady", () => {
  it("requires a probed key and model id", () => {
    expect(
      tokenRouterConnectReady({
        apiKey: "tokenrouter-key",
        modelId: "z-ai/glm-5.2",
        probed: true,
      }),
    ).toBe(true);
    expect(
      tokenRouterConnectReady({
        apiKey: "tokenrouter-key",
        modelId: "z-ai/glm-5.2",
        probed: false,
      }),
    ).toBe(false);
    expect(
      tokenRouterConnectReady({ apiKey: "short", modelId: "z-ai/glm-5.2", probed: true }),
    ).toBe(false);
  });
});
