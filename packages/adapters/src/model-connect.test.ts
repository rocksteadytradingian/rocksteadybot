import { describe, expect, it } from "vitest";
import {
  mapUserModelCredentials,
  modelCredentialDto,
  openAiCompatibleBaseUrlFromPlaintext,
} from "./model-connect.js";
import { serializeModelSecret } from "./pi-oauth.js";

describe("modelCredentialDto", () => {
  it("returns stored baseUrl and modelId for openai-compatible credentials", () => {
    const plaintext = serializeModelSecret({
      kind: "openai_compatible",
      baseUrl: "https://example.invalid/v1",
    });
    expect(
      modelCredentialDto(
        {
          id: "cred-1",
          provider: "openai-compatible",
          label: "Local MLX",
          isDefault: true,
          defaultModel: "qwen3-4b",
        },
        plaintext,
      ),
    ).toEqual({
      id: "cred-1",
      provider: "openai-compatible",
      label: "Local MLX",
      hasKey: true,
      isDefault: true,
      baseUrl: "https://example.invalid/v1",
      modelId: "qwen3-4b",
    });
  });

  it("keeps the persisted server URL when the secret cannot be decrypted", () => {
    expect(
      modelCredentialDto({
        id: "cred-3",
        provider: "openai-compatible",
        label: "OpenAI-compatible",
        isDefault: true,
        defaultModel: "prism-ml/bonsai-27b",
        baseUrl: "http://127.0.0.1:1234/v1",
      }),
    ).toMatchObject({
      baseUrl: "http://127.0.0.1:1234/v1",
      modelId: "prism-ml/bonsai-27b",
    });
  });

  it("exposes defaultModel as modelId for provider credentials", () => {
    expect(
      modelCredentialDto({
        id: "cred-2",
        provider: "xai",
        label: "xAI",
        isDefault: false,
        defaultModel: "grok-4.6",
      }),
    ).toEqual({
      id: "cred-2",
      provider: "xai",
      label: "xAI",
      hasKey: true,
      isDefault: false,
      modelId: "grok-4.6",
    });
  });

  it("returns the TokenRouter endpoint from a stored openai-compatible secret", () => {
    const plaintext = serializeModelSecret({
      kind: "openai_compatible",
      baseUrl: "https://api.tokenrouter.com/v1",
      apiKey: "tokenrouter-key",
    });
    expect(
      modelCredentialDto(
        {
          id: "cred-tr",
          provider: "tokenrouter",
          label: "TokenRouter",
          isDefault: true,
          defaultModel: "z-ai/glm-5.2",
        },
        plaintext,
      ),
    ).toMatchObject({
      provider: "tokenrouter",
      baseUrl: "https://api.tokenrouter.com/v1",
      modelId: "z-ai/glm-5.2",
    });
  });
});

describe("mapUserModelCredentials", () => {
  it("attaches baseUrl from a shared secret even when decrypt fails for another row", () => {
    const plaintext = serializeModelSecret({
      kind: "openai_compatible",
      baseUrl: "http://127.0.0.1:1234/v1",
    });
    expect(
      mapUserModelCredentials(
        [
          {
            id: "cred-live",
            provider: "openai-compatible",
            label: "OpenAI-compatible",
            isDefault: true,
            defaultModel: "qwen",
            secretId: "secret-live",
            baseUrl: "http://127.0.0.1:1234/v1",
          },
          {
            id: "cred-stale",
            provider: "openai-compatible",
            label: "OpenAI-compatible",
            isDefault: true,
            defaultModel: "auto/best-coding",
            secretId: "secret-stale",
          },
        ],
        [
          { id: "secret-live", ciphertext: "live" },
          { id: "secret-stale", ciphertext: "stale" },
        ],
        (ciphertext) => {
          if (ciphertext === "stale") throw new Error("decrypt failed");
          return plaintext;
        },
      ),
    ).toEqual([
      expect.objectContaining({
        id: "cred-live",
        baseUrl: "http://127.0.0.1:1234/v1",
        modelId: "qwen",
      }),
      expect.objectContaining({
        id: "cred-stale",
        modelId: "auto/best-coding",
      }),
    ]);
  });
});

describe("openAiCompatibleBaseUrlFromPlaintext", () => {
  it("reads the endpoint from an openai-compatible secret", () => {
    expect(
      openAiCompatibleBaseUrlFromPlaintext(
        serializeModelSecret({
          kind: "openai_compatible",
          baseUrl: "http://127.0.0.1:1234/v1",
        }),
      ),
    ).toBe("http://127.0.0.1:1234/v1");
  });
});
