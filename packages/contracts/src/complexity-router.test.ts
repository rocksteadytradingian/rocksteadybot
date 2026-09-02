import { describe, expect, it } from "vitest";
import {
  COMPLEXITY_ROUTER_MODEL_ID,
  complexityRouterActiveSummary,
  complexityRouterSlotOptions,
  isAllowedComplexityRouterSlot,
  isComplexityRouterProvider,
  withComplexityRouterCatalog,
} from "./index.js";

describe("isComplexityRouterProvider", () => {
  it("allows OpenAI-compatible gateways and local servers", () => {
    expect(isComplexityRouterProvider("openai-compatible")).toBe(true);
    expect(isComplexityRouterProvider("local")).toBe(true);
    expect(isComplexityRouterProvider("tokenrouter")).toBe(true);
    expect(isComplexityRouterProvider("anthropic")).toBe(false);
  });
});

describe("withComplexityRouterCatalog", () => {
  it("inserts Auto ahead of that provider when Fast is configured", () => {
    const catalog = withComplexityRouterCatalog(
      [
        {
          provider: "openai-compatible",
          providerName: "OpenAI-compatible",
          id: "custom",
          label: "Custom",
          billing: "yours",
          placeholder: true,
        },
        { provider: "xai", id: "grok-4.6", label: "Grok", billing: "key" },
      ],
      [{ provider: "openai-compatible", routerFastModel: "qwen3:8b" }],
    );
    expect(catalog.map((entry) => `${entry.provider}:${entry.id}`)).toEqual([
      "openai-compatible:auto",
      "openai-compatible:custom",
      "xai:grok-4.6",
    ]);
    expect(catalog[0]).toMatchObject({
      id: COMPLEXITY_ROUTER_MODEL_ID,
      label: "Auto",
      placeholder: false,
      providerName: "OpenAI-compatible",
    });
  });

  it("stays hidden until Fast is set", () => {
    expect(
      withComplexityRouterCatalog(
        [{ provider: "local", id: "qwen3:8b", label: "Qwen", billing: "" }],
        [{ provider: "local", routerFastModel: "  " }],
      ).some((entry) => entry.id === COMPLEXITY_ROUTER_MODEL_ID),
    ).toBe(false);
  });
});

describe("isAllowedComplexityRouterSlot", () => {
  it("rejects Auto and catalog placeholders", () => {
    expect(
      isAllowedComplexityRouterSlot("openai-compatible", "auto", [
        { provider: "openai-compatible", id: "custom", placeholder: true },
      ]),
    ).toBe(false);
    expect(
      isAllowedComplexityRouterSlot("openai-compatible", "custom", [
        { provider: "openai-compatible", id: "custom", placeholder: true },
      ]),
    ).toBe(false);
    expect(isAllowedComplexityRouterSlot("openai-compatible", "qwen3:8b", [])).toBe(true);
    expect(isAllowedComplexityRouterSlot("tokenrouter", "z-ai/glm-5.2", [])).toBe(true);
  });

  it("requires local slots to exist in the catalog", () => {
    expect(
      isAllowedComplexityRouterSlot("local", "qwen3:8b", [{ provider: "local", id: "qwen3:8b" }]),
    ).toBe(true);
    expect(
      isAllowedComplexityRouterSlot("local", "missing", [{ provider: "local", id: "qwen3:8b" }]),
    ).toBe(false);
  });
});

describe("complexityRouterActiveSummary", () => {
  it("joins assigned slots and skips blanks", () => {
    expect(
      complexityRouterActiveSummary({
        fast: "qwen/qwen3-8b",
        smart: " qwen/qwen3-30b-a3b ",
        heavy: "",
      }),
    ).toBe("qwen/qwen3-8b · qwen/qwen3-30b-a3b");
    expect(complexityRouterActiveSummary({ fast: "  ", smart: null, heavy: undefined })).toBe(null);
  });
});

describe("complexityRouterSlotOptions", () => {
  it("lists concrete ids and drops Auto", () => {
    expect(
      complexityRouterSlotOptions({
        probeModels: ["qwen3:8b", "qwen3:8b", COMPLEXITY_ROUTER_MODEL_ID],
        catalogIds: ["custom"],
        modelId: "connected",
        routerFastModel: "qwen3:8b",
        routerSmartModel: "  30b  ",
        routerHeavyModel: "",
      }),
    ).toEqual(["qwen3:8b", "custom", "connected", "30b"]);
  });
});
