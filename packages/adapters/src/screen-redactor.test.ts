import type { RedactableFrame, RedactionPolicy, RedactionRegion } from "@rakazo/adapter-kit";
import { REDACTION_OFF, REGULATED_REDACTION_POLICY } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { applyPolicy, NoopScreenRedactor, ScriptedScreenRedactor } from "./screen-redactor.js";

const FRAME: RedactableFrame = {
  image: new Uint8Array([1, 2, 3, 4]),
  mimeType: "image/png",
  width: 100,
  height: 60,
};

function region(entity: RedactionRegion["entity"], score = 0.9): RedactionRegion {
  return { x: 1, y: 2, w: 20, h: 8, entity, score };
}

const ctx = {
  operationId: "op",
  traceId: "tr",
  workspaceId: "ws",
  userId: "u",
  signal: new AbortController().signal,
};

describe("NoopScreenRedactor", () => {
  it("returns the frame untouched and no regions", async () => {
    const redactor = new NoopScreenRedactor();
    expect(redactor.describe().capabilities).toEqual({ image: false, text: false, ocr: false });
    const out = await redactor.redactFrame(FRAME, REGULATED_REDACTION_POLICY, ctx);
    expect(out.image).toBe(FRAME.image);
    expect(out.regions).toEqual([]);
    expect(await redactor.redactText("a@b.com", REGULATED_REDACTION_POLICY, ctx)).toBe("a@b.com");
  });
});

describe("applyPolicy", () => {
  it("drops everything when the mode is off", () => {
    expect(applyPolicy([region("EMAIL")], REDACTION_OFF)).toEqual([]);
  });

  it("keeps only selected entities above the confidence floor", () => {
    const policy: RedactionPolicy = { mode: "box-fill", entities: ["EMAIL"], minConfidence: 0.7 };
    const kept = applyPolicy(
      [region("EMAIL", 0.9), region("EMAIL", 0.5), region("PERSON", 0.99)],
      policy,
    );
    expect(kept).toEqual([region("EMAIL", 0.9)]);
  });
});

describe("ScriptedScreenRedactor", () => {
  it("filters scripted regions through the policy and records the call", async () => {
    const redactor = new ScriptedScreenRedactor({
      regions: [region("EMAIL"), region("PERSON"), region("SSN", 0.4)],
    });
    const out = await redactor.redactFrame(FRAME, REGULATED_REDACTION_POLICY, ctx);
    // PERSON is not in the regulated preset; the SSN detection is below 0.6.
    expect(out.regions.map((r) => r.entity)).toEqual(["EMAIL"]);
    expect(redactor.frameCalls).toHaveLength(1);
    expect(redactor.frameCalls[0]?.applied).toEqual(out.regions);
  });

  it("redacts nothing when the policy is off", async () => {
    const redactor = new ScriptedScreenRedactor({
      regions: [region("EMAIL")],
      textReplacements: [["secret@corp.com", "[email]"]],
    });
    expect((await redactor.redactFrame(FRAME, REDACTION_OFF, ctx)).regions).toEqual([]);
    expect(await redactor.redactText("mail secret@corp.com", REDACTION_OFF, ctx)).toBe(
      "mail secret@corp.com",
    );
  });

  it("applies string and regex text replacements in order", async () => {
    const redactor = new ScriptedScreenRedactor({
      textReplacements: [
        ["4111 1111 1111 1111", "[card]"],
        [/\b\d{3}-\d{2}-\d{4}\b/, "[ssn]"],
      ],
    });
    const out = await redactor.redactText(
      "card 4111 1111 1111 1111 ssn 123-45-6789",
      REGULATED_REDACTION_POLICY,
      ctx,
    );
    expect(out).toBe("card [card] ssn [ssn]");
    expect(redactor.textCalls).toHaveLength(1);
  });
});
