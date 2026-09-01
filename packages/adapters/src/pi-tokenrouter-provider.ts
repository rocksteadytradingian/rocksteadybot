import {
  createProvider,
  type Model,
  type MutableModels,
  type Provider,
  type ProviderStreams,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { TOKENROUTER_BASE_URL, TOKENROUTER_PROVIDER_ID } from "@rakazo/contracts";
import { createOpenAiCompatibleFetch } from "./pi-openai-compatible-provider.js";

export { TOKENROUTER_BASE_URL, TOKENROUTER_PROVIDER_ID };

/** Placeholder catalog model id; users pick a real id after probing TokenRouter. */
export const TOKENROUTER_CATALOG_MODEL_ID = "custom";

const DEFAULT_CONTEXT_WINDOW = 32_768;
const DEFAULT_MAX_TOKENS = 4_096;

function tokenRouterModel(id: string): Model<"openai-completions"> {
  return {
    id,
    name: id,
    api: "openai-completions",
    provider: TOKENROUTER_PROVIDER_ID,
    baseUrl: TOKENROUTER_BASE_URL,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };
}

function tokenRouterProvider(models: Model<"openai-completions">[]): Provider {
  const api = openAICompletionsApi();
  const safeFetch = createOpenAiCompatibleFetch();
  const safeApi: ProviderStreams = {
    stream: (model, context, options) =>
      api.stream(model, context, { ...options, fetch: safeFetch }),
    streamSimple: (model, context, options) =>
      api.streamSimple(model, context, { ...options, fetch: safeFetch }),
  };
  return createProvider({
    id: TOKENROUTER_PROVIDER_ID,
    name: "TokenRouter",
    baseUrl: TOKENROUTER_BASE_URL,
    auth: {
      apiKey: {
        name: "TokenRouter",
        resolve: async () => ({
          auth: { apiKey: "tokenrouter" },
          source: "TokenRouter",
        }),
      },
    },
    models,
    api: safeApi,
  });
}

export function tokenRouterCatalogProvider(): Provider {
  return tokenRouterProvider([
    {
      ...tokenRouterModel(TOKENROUTER_CATALOG_MODEL_ID),
      name: "Custom model id",
    },
  ]);
}

export function registerTokenRouterCatalog(models: MutableModels): MutableModels {
  models.setProvider(tokenRouterCatalogProvider());
  return models;
}

export function registerTokenRouterRuntime(
  models: MutableModels,
  opts: { modelId: string },
): MutableModels {
  models.setProvider(tokenRouterProvider([tokenRouterModel(opts.modelId.trim())]));
  return models;
}

export function prepareTokenRouterConnect(input: { apiKey?: string; modelId?: string }): {
  baseUrl: string;
  modelId: string;
  apiKey: string;
} {
  const apiKey = input.apiKey?.trim();
  const modelId = input.modelId?.trim();
  if (!apiKey || apiKey.length < 8) {
    throw new Error("API key must contain at least 8 characters");
  }
  if (!modelId) throw new Error("Model id is required for TokenRouter");
  return { baseUrl: TOKENROUTER_BASE_URL, modelId, apiKey };
}
