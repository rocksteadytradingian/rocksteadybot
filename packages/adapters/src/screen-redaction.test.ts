import type { ComputerObservation } from "@rakazo/adapter-kit";
import { REDACTION_OFF, REGULATED_REDACTION_POLICY } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { redactObservation } from "./screen-redaction.js";
import { NoopScreenRedactor, ScriptedScreenRedactor } from "./screen-redactor.js";

const ctx = {
  operationId: "op",
  traceId: "tr",
  workspaceId: "ws",
  userId: "u",
  signal: new AbortController().signal,
};

function observation(overrides: Partial<ComputerObservation> = {}): ComputerObservation {
  return {
    frameId: "sha-of-original",
    capturedAt: "2026-09-07T12:00:00.000Z",
    mimeType: "image/png",
    image: new Uint8Array([9, 9, 9, 9]),
    width: 200,
    height: 120,
    activeWindow: { id: "w1", title: "Inbox — alice@corp.com" },
    ...overrides,
  };
}

describe("redactObservation", () => {
  it("returns the observation untouched when the policy is off", async () => {
    const redactor = new ScriptedScreenRedactor({
      regions: [{ x: 0, y: 0, w: 10, h: 4, entity: "EMAIL", score: 0.99 }],
    });
    const spy = vi.spyOn(redactor, "redactFrame");
    const original = observation();
    const out = await redactObservation(original, redactor, REDACTION_OFF, ctx);
    expect(out.observation).toBe(original);
    expect(out.regions).toEqual([]);
    expect(out.note).toBe("");
    expect(spy).not.toHaveBeenCalled();
  });

  it("swaps the image, keeps the original frameId, and notes what it redacted", async () => {
    const scrubbed = new Uint8Array([0, 0, 0, 0]);
    const redactor = new ScriptedScreenRedactor({
      regions: [{ x: 4, y: 4, w: 40, h: 10, entity: "EMAIL", score: 0.95 }],
      textReplacements: [["alice@corp.com", "[email]"]],
    });
    vi.spyOn(redactor, "redactFrame").mockResolvedValue({
      image: scrubbed,
      regions: [{ x: 4, y: 4, w: 40, h: 10, entity: "EMAIL", score: 0.95 }],
    });

    const out = await redactObservation(observation(), redactor, REGULATED_REDACTION_POLICY, ctx);

    expect(out.observation.image).toBe(scrubbed);
    expect(out.observation.frameId).toBe("sha-of-original");
    expect(out.observation.activeWindow?.title).toBe("Inbox — [email]");
    expect(out.note).toBe("redacted 1 region (EMAIL)");
  });

  it("consults an enabled policy but emits no note when nothing matches", async () => {
    const original = observation({ activeWindow: undefined });
    const out = await redactObservation(
      original,
      new NoopScreenRedactor(),
      { mode: "box-fill", entities: ["SSN"], minConfidence: 0.6 },
      ctx,
    );
    expect(out.regions).toEqual([]);
    expect(out.note).toBe("");
    expect(out.observation.image).toBe(original.image);
  });

  it("fails open: a throwing redactor yields the untouched observation", async () => {
    const redactor = new NoopScreenRedactor();
    vi.spyOn(redactor, "redactFrame").mockRejectedValue(new Error("presidio down"));
    const original = observation();
    const out = await redactObservation(original, redactor, REGULATED_REDACTION_POLICY, ctx);
    expect(out.observation).toBe(original);
    expect(out.regions).toEqual([]);
    expect(out.note).toBe("");
  });
});
