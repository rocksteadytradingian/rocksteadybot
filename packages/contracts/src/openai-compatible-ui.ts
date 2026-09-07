import { PRODUCT_NAME } from "./brand.js";

export const OPENAI_COMPATIBLE_BASE_URL_HINT = `Paste the OpenAI-compatible address from your server. ${PRODUCT_NAME} adds /v1 if needed.`;

export function openAiCompatibleConnectReady(input: {
  baseUrl: string;
  modelId: string;
  probedBaseUrl: string | null;
  storedBaseUrl?: string;
}): boolean {
  const trimmedUrl = input.baseUrl.trim();
  const trimmedModel = input.modelId.trim();
  if (!trimmedUrl || !trimmedModel) return false;
  const probeOk = input.probedBaseUrl === trimmedUrl;
  const storedOk = Boolean(input.storedBaseUrl && input.storedBaseUrl === trimmedUrl);
  return probeOk || storedOk;
}

export function openAiCompatibleProbeSuccessMessage(modelCount: number): string {
  return modelCount
    ? `Found ${modelCount} model${modelCount === 1 ? "" : "s"}.`
    : "Server found. Enter a model name.";
}

export function tokenRouterConnectReady(input: {
  apiKey: string;
  modelId: string;
  probed: boolean;
}): boolean {
  return input.apiKey.trim().length >= 8 && Boolean(input.modelId.trim()) && input.probed;
}

export function selectProviderCredential<
  T extends { provider: string; isDefault: boolean; baseUrl?: string },
>(credentials: T[], provider: string): T | undefined {
  const matches = credentials.filter((entry) => entry.provider === provider);
  return (
    matches.find((entry) => Boolean(entry.baseUrl?.trim()) && entry.isDefault) ??
    matches.find((entry) => Boolean(entry.baseUrl?.trim())) ??
    matches.find((entry) => entry.isDefault) ??
    matches[0]
  );
}

export function pinActiveModelProviders<T extends { id: string }>(
  groups: T[],
  opts: { activeProvider?: string | null; connectedProviders: Iterable<string> },
): T[] {
  const connected = new Set(opts.connectedProviders);
  const rank = (id: string) => (id === opts.activeProvider ? 0 : connected.has(id) ? 1 : 2);
  return [...groups].sort((a, b) => rank(a.id) - rank(b.id));
}
