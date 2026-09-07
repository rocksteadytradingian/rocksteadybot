import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button.js";

describe("Button", () => {
  it("uses theme tokens for outline text so labels stay readable", () => {
    const html = renderToString(
      <Button type="button" variant="outline" size="sm">
        Take control
      </Button>,
    );
    expect(html).toContain("text-[var(--rk-ink)]");
    expect(html).toContain("border-[var(--rk-hairline-strong)]");
    expect(html).not.toContain("text-[#ECECEE]");
  });
});
