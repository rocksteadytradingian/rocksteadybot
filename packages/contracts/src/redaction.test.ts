import { describe, expect, it } from "vitest";
import {
  REDACTION_OFF,
  REGULATED_REDACTION_POLICY,
  RedactionPolicySchema,
  RedactionRegionSchema,
  redactionEnabled,
  redactionSummary,
} from "./redaction.js";

describe("redaction policy contract", () => {
  it("accepts the shipped presets", () => {
    expect(RedactionPolicySchema.safeParse(REDACTION_OFF).success).toBe(true);
    expect(RedactionPolicySchema.safeParse(REGULATED_REDACTION_POLICY).success).toBe(true);
  });

  it("rejects an unknown entity, a bad mode, and an out-of-range confidence", () => {
    expect(
      RedactionPolicySchema.safeParse({ mode: "box-fill", entities: ["FACE"], minConfidence: 0.5 })
        .success,
    ).toBe(false);
    expect(
      RedactionPolicySchema.safeParse({ mode: "pixelate", entities: [], minConfidence: 0.5 })
        .success,
    ).toBe(false);
    expect(
      RedactionPolicySchema.safeParse({ mode: "off", entities: [], minConfidence: 2 }).success,
    ).toBe(false);
  });

  it("requires a positive width and height on a region", () => {
    expect(
      RedactionRegionSchema.safeParse({ x: 0, y: 0, w: 10, h: 4, entity: "EMAIL", score: 0.9 })
        .success,
    ).toBe(true);
    expect(
      RedactionRegionSchema.safeParse({ x: 0, y: 0, w: 0, h: 4, entity: "EMAIL", score: 0.9 })
        .success,
    ).toBe(false);
  });
});

describe("redactionEnabled", () => {
  it("is off when the mode is off or nothing is selected", () => {
    expect(redactionEnabled(REDACTION_OFF)).toBe(false);
    expect(redactionEnabled({ mode: "box-fill", entities: [], minConfidence: 0.6 })).toBe(false);
    expect(redactionEnabled(REGULATED_REDACTION_POLICY)).toBe(true);
  });
});

describe("redactionSummary", () => {
  it("is empty when nothing was redacted", () => {
    expect(redactionSummary([])).toBe("");
  });

  it("counts regions and lists distinct entity kinds, sorted", () => {
    const region = (entity: "EMAIL" | "PERSON") => ({
      x: 0,
      y: 0,
      w: 5,
      h: 5,
      entity,
      score: 0.9,
    });
    expect(redactionSummary([region("PERSON"), region("EMAIL"), region("EMAIL")])).toBe(
      "redacted 3 regions (EMAIL, PERSON)",
    );
    expect(redactionSummary([region("EMAIL")])).toBe("redacted 1 region (EMAIL)");
  });
});
