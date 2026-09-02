import {
  COMPLEXITY_ROUTER_MODEL_ID,
  isProbedModelProvider,
  LOCAL_PROVIDER_ID,
  type ModelCatalogEntry,
} from "./domain.js";

export function isComplexityRouterProvider(provider: string): boolean {
  return isProbedModelProvider(provider) || provider === LOCAL_PROVIDER_ID;
}

export function withComplexityRouterCatalog<
  T extends Pick<ModelCatalogEntry, "provider" | "id"> & Partial<ModelCatalogEntry>,
>(catalog: T[], credentials: Array<{ provider: string; routerFastModel?: string | null }>): T[] {
  const result = [...catalog];
  const seen = new Set<string>();
  for (const credential of credentials) {
    if (!isComplexityRouterProvider(credential.provider)) continue;
    if (!credential.routerFastModel?.trim()) continue;
    if (seen.has(credential.provider)) continue;
    seen.add(credential.provider);
    if (
      result.some(
        (entry) =>
          entry.provider === credential.provider && entry.id === COMPLEXITY_ROUTER_MODEL_ID,
      )
    ) {
      continue;
    }
    const template = result.find((entry) => entry.provider === credential.provider);
    const autoEntry = {
      ...(template ?? { provider: credential.provider }),
      provider: credential.provider,
      providerName: template?.providerName ?? credential.provider,
      id: COMPLEXITY_ROUTER_MODEL_ID,
      label: "Auto",
      billing: template?.billing ?? "",
      placeholder: false,
    } as T;
    const insertAt = result.findIndex((entry) => entry.provider === credential.provider);
    if (insertAt >= 0) result.splice(insertAt, 0, autoEntry);
    else result.push(autoEntry);
  }
  return result;
}

export function isAllowedComplexityRouterSlot(
  provider: string,
  modelId: string,
  catalog: Array<{ provider: string; id: string; placeholder?: boolean }>,
): boolean {
  const id = modelId.trim();
  if (!id || id === COMPLEXITY_ROUTER_MODEL_ID) return false;
  if (
    catalog.some((entry) => entry.provider === provider && entry.id === id && entry.placeholder)
  ) {
    return false;
  }
  if (isProbedModelProvider(provider)) return true;
  return catalog.some((entry) => entry.provider === provider && entry.id === id);
}

export function complexityRouterActiveSummary(slots: {
  fast?: string | null;
  smart?: string | null;
  heavy?: string | null;
}): string | null {
  const parts = [slots.fast, slots.smart, slots.heavy]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function complexityRouterSlotOptions(input: {
  probeModels?: Iterable<string>;
  catalogIds?: Iterable<string>;
  modelId?: string | null;
  routerFastModel?: string | null;
  routerSmartModel?: string | null;
  routerHeavyModel?: string | null;
}): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const value of [
    ...(input.probeModels ?? []),
    ...(input.catalogIds ?? []),
    input.modelId,
    input.routerFastModel,
    input.routerSmartModel,
    input.routerHeavyModel,
  ]) {
    const id = value?.trim();
    if (!id || id === COMPLEXITY_ROUTER_MODEL_ID || seen.has(id)) continue;
    seen.add(id);
    options.push(id);
  }
  return options;
}
