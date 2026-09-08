import { describe, expect, it } from "vitest";
import { browserAgentTools, builtinAgentTools } from "./builtin-tools.js";
import { IMAGE_RETURNING_COMPUTER_TOOLS } from "./model-vision.js";

describe("browserAgentTools", () => {
  it("exposes the browser driving tools", () => {
    expect(browserAgentTools.map((tool) => tool.name)).toEqual([
      "browser_snapshot",
      "browser_navigate",
      "browser_click",
      "browser_type",
      "browser_select",
      "browser_screenshot",
    ]);
  });

  it("does not overlap the computer/file builtins", () => {
    const builtin = new Set(builtinAgentTools.map((tool) => tool.name));
    for (const tool of browserAgentTools) expect(builtin.has(tool.name)).toBe(false);
  });

  it("marks only the screenshot tool as image-returning", () => {
    expect(IMAGE_RETURNING_COMPUTER_TOOLS.has("browser_screenshot")).toBe(true);
    expect(IMAGE_RETURNING_COMPUTER_TOOLS.has("browser_snapshot")).toBe(false);
  });

  it("requires a ref on the element-targeting tools", () => {
    for (const name of ["browser_click", "browser_type", "browser_select"]) {
      const tool = browserAgentTools.find((entry) => entry.name === name);
      expect(tool?.inputSchema.required).toContain("ref");
    }
  });
});
