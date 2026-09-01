import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { TOKENROUTER_BASE_URL, TOKENROUTER_PROVIDER_ID } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  prepareTokenRouterConnect,
  registerTokenRouterRuntime,
  TOKENROUTER_CATALOG_MODEL_ID,
  tokenRouterCatalogProvider,
} from "./pi-tokenrouter-provider.js";

describe("TokenRouter provider", () => {
  it("always exposes a catalog provider entry", () => {
    const provider = tokenRouterCatalogProvider();
    expect(provider.id).toBe(TOKENROUTER_PROVIDER_ID);
    expect(provider.name).toBe("TokenRouter");
    expect(provider.getModels()[0]?.id).toBe(TOKENROUTER_CATALOG_MODEL_ID);
  });

  it("registers runtime models at the TokenRouter base URL", () => {
    const models = registerTokenRouterRuntime(builtinModels(), { modelId: "z-ai/glm-5.2" });
    const model = models.getModel(TOKENROUTER_PROVIDER_ID, "z-ai/glm-5.2");
    expect(model?.baseUrl).toBe(TOKENROUTER_BASE_URL);
    expect(model?.api).toBe("openai-completions");
    expect(model?.input).toContain("image");
  });

  it("rejects incomplete connect payloads", () => {
    expect(() => prepareTokenRouterConnect({ apiKey: "short", modelId: "z-ai/glm-5.2" })).toThrow(
      /at least 8 characters/,
    );
    expect(() => prepareTokenRouterConnect({ apiKey: "tokenrouter-key" })).toThrow(/Model id/);
  });
});
