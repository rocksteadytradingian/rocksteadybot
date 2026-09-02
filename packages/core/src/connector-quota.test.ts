import { describe, expect, it } from "vitest";
import { guideConnectorProviderError, isConnectorQuotaError } from "./connector-quota.js";

describe("connector quota guidance", () => {
  it("detects 429 and quotaExceeded without treating other 403s as quota", () => {
    expect(isConnectorQuotaError("429 Too Many Requests")).toBe(true);
    expect(isConnectorQuotaError("403 quotaExceeded")).toBe(true);
    expect(isConnectorQuotaError("RESOURCE_EXHAUSTED")).toBe(true);
    expect(isConnectorQuotaError("403 permission denied")).toBe(false);
  });

  it("tells the model to wait and not fall back to the browser", () => {
    const guided = guideConnectorProviderError("429 quotaExceeded");
    expect(guided).toContain("Wait before retrying");
    expect(guided).toContain("computer browser");
    expect(guideConnectorProviderError("tool failed")).toBe("tool failed");
    expect(guideConnectorProviderError(guided)).toBe(guided);
  });
});
