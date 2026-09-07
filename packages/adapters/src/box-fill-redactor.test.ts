import type { RedactableFrame, RedactionPolicy, RedactionRegion } from "@rakazo/adapter-kit";
import { REDACTION_OFF } from "@rakazo/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { BoxFillScreenRedactor, clampRegions } from "./box-fill-redactor.js";

const ctx = {
  operationId: "op",
  traceId: "tr",
  workspaceId: "ws",
  userId: "u",
  signal: new AbortController().signal,
};

const policy: RedactionPolicy = { mode: "box-fill", entities: ["EMAIL"], minConfidence: 0.6 };
const region = (over: Partial<RedactionRegion> = {}): RedactionRegion => ({
  x: 6,
  y: 4,
  w: 12,
  h: 8,
  entity: "EMAIL",
  score: 1,
  ...over,
});

let WHITE_PNG: Uint8Array;
async function frame(): Promise<RedactableFrame> {
  return { image: WHITE_PNG, mimeType: "image/png", width: 40, height: 20 };
}

beforeAll(async () => {
  const { default: sharp } = await import("sharp");
  WHITE_PNG = new Uint8Array(
    await sharp({
      create: { width: 40, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer(),
  );
});

async function pixel(image: Uint8Array, x: number, y: number): Promise<[number, number, number]> {
  const { default: sharp } = await import("sharp");
  const raw = await sharp(Buffer.from(image))
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer();
  return [raw[0] as number, raw[1] as number, raw[2] as number];
}

describe("BoxFillScreenRedactor", () => {
  it("describes an image + text redactor; ocr follows the option", () => {
    expect(new BoxFillScreenRedactor().describe().capabilities).toEqual({
      image: true,
      text: true,
      ocr: false,
    });
    expect(new BoxFillScreenRedactor({ ocr: true }).describe().capabilities.ocr).toBe(true);
  });

  it("delegates text redaction to the regex redactor", async () => {
    const out = await new BoxFillScreenRedactor().redactText("mail alice@corp.com", policy, ctx);
    expect(out).toBe("mail [EMAIL]");
  });

  it("leaves the frame untouched with no detector", async () => {
    const f = await frame();
    const out = await new BoxFillScreenRedactor().redactFrame(f, policy, ctx);
    expect(out.image).toBe(f.image);
    expect(out.regions).toEqual([]);
  });

  it("does not paint when the policy is off, even with a detector", async () => {
    const redactor = new BoxFillScreenRedactor({ detect: async () => [region()] });
    const f = await frame();
    const out = await redactor.redactFrame(f, REDACTION_OFF, ctx);
    expect(out.image).toBe(f.image);
  });

  it("blanks a detected region to black and keeps the image dimensions", async () => {
    const redactor = new BoxFillScreenRedactor({ detect: async () => [region()] });
    const out = await redactor.redactFrame(await frame(), policy, ctx);

    expect(out.regions).toEqual([region()]);
    expect(Buffer.from(out.image).equals(Buffer.from(WHITE_PNG))).toBe(false);
    expect(await pixel(out.image, 12, 8)).toEqual([0, 0, 0]); // inside the region
    expect(await pixel(out.image, 1, 1)).toEqual([255, 255, 255]); // outside it

    const { default: sharp } = await import("sharp");
    const meta = await sharp(Buffer.from(out.image)).metadata();
    expect([meta.width, meta.height]).toEqual([40, 20]);
  });

  it("is deterministic", async () => {
    const redactor = new BoxFillScreenRedactor({ detect: async () => [region()] });
    const a = await redactor.redactFrame(await frame(), policy, ctx);
    const b = await redactor.redactFrame(await frame(), policy, ctx);
    expect(Buffer.from(a.image).equals(Buffer.from(b.image))).toBe(true);
  });

  it("clamps a region that spills past the frame edge", async () => {
    const redactor = new BoxFillScreenRedactor({
      detect: async () => [region({ x: 34, y: 16, w: 20, h: 20 })],
    });
    const out = await redactor.redactFrame(await frame(), policy, ctx);
    expect(out.regions[0]).toMatchObject({ x: 34, y: 16, w: 6, h: 4 });
    expect(await pixel(out.image, 38, 18)).toEqual([0, 0, 0]);
  });

  it("drops a region with no on-frame area", async () => {
    expect(clampRegions([region({ x: 100, y: 100 })], { width: 40, height: 20 })).toEqual([]);
  });
});
