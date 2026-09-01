import type { ModelConnectInput, ModelCredential } from "@rakazo/contracts";
import { isProbedModelProvider, TOKENROUTER_PROVIDER_ID } from "@rakazo/contracts";
import { parseModelSecret, type StoredModelSecret, serializeModelSecret } from "./pi-oauth.js";
import {
  OPENAI_COMPATIBLE_PROVIDER_ID,
  prepareOpenAiCompatibleConnect,
} from "./pi-openai-compatible-provider.js";
import { prepareTokenRouterConnect } from "./pi-tokenrouter-provider.js";

export type ModelCredentialRow = {
  id: string;
  provider: string;
  label: string;
  isDefault: boolean;
  defaultModel?: string | null;
  secretId?: string;
  baseUrl?: string | null;
  routerFastModel?: string | null;
  routerSmartModel?: string | null;
  routerHeavyModel?: string | null;
};

export function buildModelConnectPlaintext(input: ModelConnectInput): string {
  if (input.provider === OPENAI_COMPATIBLE_PROVIDER_ID) {
    const prepared = prepareOpenAiCompatibleConnect(input);
    const secret: StoredModelSecret = {
      kind: "openai_compatible",
      baseUrl: prepared.baseUrl,
      ...(prepared.apiKey ? { apiKey: prepared.apiKey } : {}),
    };
    return serializeModelSecret(secret);
  }
  if (input.provider === TOKENROUTER_PROVIDER_ID) {
    const prepared = prepareTokenRouterConnect(input);
    return serializeModelSecret({
      kind: "openai_compatible",
      baseUrl: prepared.baseUrl,
      apiKey: prepared.apiKey,
    });
  }
  const apiKey = input.apiKey?.trim();
  if (!apiKey || apiKey.length < 8) {
    throw new Error("API key must contain at least 8 characters");
  }
  return apiKey;
}

export function openAiCompatibleBaseUrlFromPlaintext(plaintext: string): string | null {
  const parsed = parseModelSecret(plaintext);
  return parsed.kind === "openai_compatible" ? parsed.baseUrl : null;
}

export function modelCredentialDto(row: ModelCredentialRow, plaintext?: string): ModelCredential {
  const credential: ModelCredential = {
    id: row.id,
    provider: row.provider,
    label: row.label,
    hasKey: true,
    isDefault: row.isDefault,
    ...(row.defaultModel ? { modelId: row.defaultModel } : {}),
    ...(row.routerFastModel ? { routerFastModel: row.routerFastModel } : {}),
    ...(row.routerSmartModel ? { routerSmartModel: row.routerSmartModel } : {}),
    ...(row.routerHeavyModel ? { routerHeavyModel: row.routerHeavyModel } : {}),
  };
  if (!isProbedModelProvider(row.provider)) return credential;
  const storedUrl = row.baseUrl?.trim() || undefined;
  if (!plaintext) {
    return storedUrl ? { ...credential, baseUrl: storedUrl } : credential;
  }
  const parsed = parseModelSecret(plaintext);
  if (parsed.kind !== "openai_compatible") {
    return storedUrl ? { ...credential, baseUrl: storedUrl } : credential;
  }
  return {
    ...credential,
    baseUrl: parsed.baseUrl,
    modelId: row.defaultModel ?? undefined,
  };
}

export function mapUserModelCredentials(
  rows: ModelCredentialRow[],
  secrets: Array<{ id: string; ciphertext: string }>,
  loadSecret: (ciphertext: string) => string,
): ModelCredential[] {
  const ciphertextById = new Map(secrets.map((secret) => [secret.id, secret.ciphertext]));
  return rows.map((row) => {
    const ciphertext = row.secretId ? ciphertextById.get(row.secretId) : undefined;
    if (!ciphertext) return modelCredentialDto(row);
    try {
      return modelCredentialDto(row, loadSecret(ciphertext));
    } catch {
      return modelCredentialDto(row);
    }
  });
}
