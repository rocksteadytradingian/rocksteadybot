import {
  LOCAL_PROVIDER_ID,
  OPENAI_COMPATIBLE_PROVIDER_ID,
  TOKENROUTER_PROVIDER_ID,
} from "@rakazo/contracts";

export type ModelConnectionErrorContext = {
  provider?: string | null;
  baseUrl?: string | null;
};

const CONNECTION_MESSAGE = /^(connection error\.?|fetch failed|network error)$/i;
const CONNECTION_DETAIL =
  /econnrefused|enotfound|etimedout|econnreset|socket hang up|other side closed|connect(?:ion)? timed? out/i;
const RATE_LIMIT = /^\s*429\b|too many requests|rate[- ]?limit|overloaded_error/i;

function isLocalProvider(provider?: string | null): boolean {
  return provider === OPENAI_COMPATIBLE_PROVIDER_ID || provider === LOCAL_PROVIDER_ID;
}

function providerLabel(provider?: string | null): string {
  if (!provider) return "the model provider";
  if (provider === "anthropic") return "Anthropic";
  if (provider === "openai") return "OpenAI";
  if (provider === "openrouter") return "OpenRouter";
  if (provider === TOKENROUTER_PROVIDER_ID) return "TokenRouter";
  if (provider === "google" || provider === "gemini") return "Google";
  if (provider === "xai") return "xAI";
  return provider;
}

function isConnectionFailure(message: string): boolean {
  const trimmed = message.trim();
  return CONNECTION_MESSAGE.test(trimmed) || CONNECTION_DETAIL.test(trimmed);
}

function isRateLimit(message: string): boolean {
  return RATE_LIMIT.test(message);
}

/** Turn opaque SDK failures into a short instruction the user can act on. */
export function humanizeModelConnectionError(
  message: string,
  context: ModelConnectionErrorContext = {},
): string {
  const trimmed = message.trim();
  if (!trimmed) return "Could not complete this reply.";
  if (isRateLimit(trimmed)) {
    return "This model is rate-limited right now. Wait a moment and try again.";
  }
  if (!isConnectionFailure(trimmed)) return message;
  if (isLocalProvider(context.provider)) {
    const url = context.baseUrl?.trim();
    return url
      ? `Could not reach the local model server at ${url}. Start it and try again.`
      : "Could not reach the local model server. Start it and try again.";
  }
  return `Could not reach ${providerLabel(context.provider)}. Check your network and try again.`;
}
