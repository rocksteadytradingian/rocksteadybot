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
    expect(html).toContain("text-[color:var(--rk-ink)]");
    expect(html).toContain("bg-[var(--rk-surface)]");
    expect(html).toContain("border-[var(--rk-ink)]");
    expect(html).not.toContain("text-[#ECECEE]");
  });

  it("keeps filled labels on the solid ink token", () => {
    const html = renderToString(<Button type="button">Save</Button>);
    expect(html).toContain("bg-[var(--rk-solid)]");
    expect(html).toContain("text-[color:var(--rk-solid-ink)]");
  });
});
