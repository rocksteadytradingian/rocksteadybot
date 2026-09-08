import { describe, expect, it } from "vitest";
import { browserTeachEvent } from "./browser-teach.js";
import type { TeachRecordingEvent } from "./teach-playbook.js";
import { buildPlaybookFromRecording, describeBrowserStep } from "./teach-playbook.js";

const ctx = { url: "https://shop.test/cart", hash: "abc123" };

describe("browserTeachEvent", () => {
  it("records a click with the picked element and page-after facts", () => {
    const event = browserTeachEvent(
      { kind: "click", ref: "e5" },
      { ...ctx, role: "link", name: "Checkout" },
    );
    expect(event).toMatchObject({
      kind: "browser",
      action: "click",
      ref: "e5",
      role: "link",
      name: "Checkout",
      url: "https://shop.test/cart",
      hash: "abc123",
    });
    expect(event.at).toBeTruthy();
  });

  it("redacts secret-looking typed text and keeps the submit flag", () => {
    const event = browserTeachEvent(
      { kind: "type", ref: "e2", text: "my secret passphrase", submit: true },
      { ...ctx, name: "Search" },
    );
    expect(event.text).toBe("[redacted input]");
    expect(event.submit).toBe(true);
  });

  it("keeps checkpoint intent in summary", () => {
    const event = browserTeachEvent(
      { kind: "checkpoint", expect: "the order shows as placed" },
      ctx,
    );
    expect(event.summary).toBe("the order shows as placed");
  });
});

describe("describeBrowserStep", () => {
  it("renders each action kind", () => {
    expect(
      describeBrowserStep({ at: "", kind: "browser", action: "navigate", url: "https://a.test" }),
    ).toBe("Go to https://a.test.");
    expect(
      describeBrowserStep({
        at: "",
        kind: "browser",
        action: "click",
        role: "button",
        name: "Buy",
      }),
    ).toBe('Click button "Buy".');
    expect(
      describeBrowserStep({
        at: "",
        kind: "browser",
        action: "type",
        name: "Email",
        text: "a@b.test",
        submit: true,
      }),
    ).toBe('Type "a@b.test" into "Email" and submit.');
    expect(
      describeBrowserStep({
        at: "",
        kind: "browser",
        action: "select",
        name: "Size",
        values: ["L"],
      }),
    ).toBe('Choose "L" in "Size".');
    expect(
      describeBrowserStep({ at: "", kind: "browser", action: "checkpoint", summary: "cart empty" }),
    ).toBe("Check: cart empty.");
  });
});

describe("buildPlaybookFromRecording with browser events", () => {
  it("turns a browser demonstration into ordered steps", () => {
    const events: TeachRecordingEvent[] = [
      { at: "1", kind: "browser", action: "navigate", url: "https://shop.test" },
      { at: "2", kind: "browser", action: "click", role: "link", name: "Cart" },
      { at: "3", kind: "browser", action: "type", name: "Coupon", text: "SAVE10", submit: true },
      { at: "4", kind: "browser", action: "checkpoint", summary: "discount applied" },
    ];
    const playbook = buildPlaybookFromRecording("Apply the coupon", events);
    expect(playbook.steps).toEqual([
      "Go to https://shop.test.",
      'Click link "Cart".',
      'Type "SAVE10" into "Coupon" and submit.',
      "Check: discount applied.",
    ]);
  });
});
