import type { ComputerObservation } from "@rakazo/adapter-kit";
import { REDACTION_OFF, REGULATED_REDACTION_POLICY } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { BoxFillScreenRedactor } from "./box-fill-redactor.js";
import { createScreenRedaction, redactObservation } from "./screen-redaction.js";
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

describe("createScreenRedaction", () => {
  it("reads the policy from the database and defaults to the box-fill redactor", async () => {
    const findUnique = vi.fn().mockResolvedValue({ redactionPolicy: REGULATED_REDACTION_POLICY });
    const prisma = { organization: { findUnique } } as unknown as Parameters<
      typeof createScreenRedaction
    >[0];

    const redaction = createScreenRedaction(prisma);
    expect(redaction.redactor).toBeInstanceOf(BoxFillScreenRedactor);
    await expect(redaction.policyFor("ws-1")).resolves.toEqual(REGULATED_REDACTION_POLICY);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      select: { redactionPolicy: true },
    });
  });

  it("takes an injected redactor", () => {
    const redactor = new ScriptedScreenRedactor();
    const redaction = createScreenRedaction({} as never, { redactor });
    expect(redaction.redactor).toBe(redactor);
  });

  it("wires an ocr engine into an image-capable box-fill redactor", async () => {
    const ocr = vi
      .fn()
      .mockResolvedValue([{ text: "alice@corp.com", bbox: { x0: 4, y0: 4, x1: 90, y1: 16 } }]);
    const { redactor } = createScreenRedaction({} as never, { ocr });
    expect(redactor.describe().capabilities.ocr).toBe(true);

    const { default: sharp } = await import("sharp");
    const image = new Uint8Array(
      await sharp({
        create: { width: 120, height: 24, channels: 3, background: { r: 255, g: 255, b: 255 } },
      })
        .png()
        .toBuffer(),
    );
    const out = await redactor.redactFrame(
      { image, mimeType: "image/png", width: 120, height: 24 },
      { mode: "box-fill", entities: ["EMAIL"], minConfidence: 0.6 },
      {
        operationId: "op",
        traceId: "tr",
        workspaceId: "ws",
        userId: "u",
        signal: new AbortController().signal,
      },
    );
    expect(ocr).toHaveBeenCalledOnce();
    expect(out.regions.map((r) => r.entity)).toEqual(["EMAIL"]);
  });
});
