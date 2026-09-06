import type { RedactionPolicy } from "@rakazo/adapter-kit";
import { REDACTION_OFF } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  createOcrRegionDetector,
  detectRegionsFromOcr,
  type OcrWord,
} from "./ocr-region-detector.js";

const policy: RedactionPolicy = {
  mode: "box-fill",
  entities: ["EMAIL", "SSN"],
  minConfidence: 0.6,
};

function word(text: string, x0: number, y0: number, x1: number, y1: number): OcrWord {
  return { text, bbox: { x0, y0, x1, y1 } };
}

describe("detectRegionsFromOcr", () => {
  it("finds nothing on an empty page or an off policy", () => {
    expect(detectRegionsFromOcr([], policy)).toEqual([]);
    expect(detectRegionsFromOcr([word("alice@corp.com", 0, 0, 90, 12)], REDACTION_OFF)).toEqual([]);
  });

  it("boxes a single OCR token that matches an entity", () => {
    const regions = detectRegionsFromOcr(
      [word("From:", 4, 4, 40, 16), word("alice@corp.com", 44, 4, 150, 16)],
      policy,
    );
    expect(regions).toEqual([{ x: 44, y: 4, w: 106, h: 12, entity: "EMAIL", score: 0.9 }]);
  });

  it("unions the boxes of the words an entity spans on one line", () => {
    // A phone number OCR split into three tokens: the PHONE pattern tolerates space separators.
    const phonePolicy: RedactionPolicy = {
      mode: "box-fill",
      entities: ["PHONE"],
      minConfidence: 0.6,
    };
    const regions = detectRegionsFromOcr(
      [word("415", 10, 20, 30, 32), word("555", 34, 20, 54, 32), word("2671", 58, 20, 84, 32)],
      phonePolicy,
    );
    expect(regions).toEqual([{ x: 10, y: 20, w: 74, h: 12, entity: "PHONE", score: 0.9 }]);
  });

  it("keeps matches on different lines as separate regions", () => {
    const regions = detectRegionsFromOcr(
      [word("a@b.com", 0, 0, 60, 12), word("c@d.com", 0, 40, 60, 52)],
      policy,
    );
    expect(regions).toHaveLength(2);
    expect(regions.map((r) => r.y)).toEqual([0, 40]);
  });

  it("does not match an entity OCR split across whitespace", () => {
    const regions = detectRegionsFromOcr(
      [word("alice", 0, 0, 30, 12), word("@", 32, 0, 38, 12), word("corp.com", 40, 0, 90, 12)],
      policy,
    );
    expect(regions).toEqual([]);
  });
});

describe("createOcrRegionDetector", () => {
  it("runs the engine and maps its words to regions", async () => {
    const ocr = vi
      .fn()
      .mockResolvedValue([word("ssn", 0, 0, 20, 12), word("123-45-6789", 24, 0, 110, 12)]);
    const detect = createOcrRegionDetector(ocr);

    const regions = await detect(
      { image: new Uint8Array([1]), mimeType: "image/png", width: 200, height: 40 },
      policy,
      {
        operationId: "op",
        traceId: "tr",
        workspaceId: "ws",
        userId: "u",
        signal: new AbortController().signal,
      },
    );

    expect(ocr).toHaveBeenCalledOnce();
    expect(regions).toEqual([{ x: 24, y: 0, w: 86, h: 12, entity: "SSN", score: 0.9 }]);
  });

  it("skips OCR entirely when the policy is off", async () => {
    const ocr = vi.fn();
    const detect = createOcrRegionDetector(ocr);
    await detect(
      { image: new Uint8Array(), mimeType: "image/png", width: 1, height: 1 },
      REDACTION_OFF,
      {
        operationId: "op",
        traceId: "tr",
        workspaceId: "ws",
        userId: "u",
        signal: new AbortController().signal,
      },
    );
    expect(ocr).not.toHaveBeenCalled();
  });
});
