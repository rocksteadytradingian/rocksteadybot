import type {
  AdapterContext,
  AdapterDescriptor,
  RedactableFrame,
  RedactedFrame,
  RedactionPolicy,
  RedactionRegion,
  ScreenRedactor,
  ScreenRedactorCapabilities,
} from "@rakazo/adapter-kit";
import { RegexTextRedactor } from "./regex-text-redactor.js";
import { applyPolicy } from "./screen-redactor.js";

/**
 * Finds regions to blank in a raster frame. The detector — OCR + entity patterns, or a
 * Presidio image service — is supplied separately; without one, box-fill has nothing to paint.
 */
export type RegionDetector = (
  frame: RedactableFrame,
  policy: RedactionPolicy,
  context: AdapterContext,
) => Promise<RedactionRegion[]>;

export interface BoxFillRedactorOptions {
  detect?: RegionDetector;
  /** True when `detect` recognises text in the pixels (surfaced as `capabilities.ocr`). */
  ocr?: boolean;
}

/**
 * Blanks detected regions of a screenshot with sharp, and scrubs the text that travels with
 * it via {@link RegexTextRedactor}. `redactFrame` is a no-op until a `detect` function is
 * supplied — locating the regions is a separate concern. Deterministic: the same frame,
 * policy and detections produce byte-identical output. sharp is imported lazily, so a run
 * that never triggers a paint does not pay for the native module.
 */
export class BoxFillScreenRedactor implements ScreenRedactor {
  private readonly text = new RegexTextRedactor();
  private readonly detect: RegionDetector;
  private readonly ocr: boolean;

  constructor(options: BoxFillRedactorOptions = {}) {
    this.detect = options.detect ?? (async () => []);
    this.ocr = options.ocr ?? false;
  }

  describe(): AdapterDescriptor<ScreenRedactorCapabilities> {
    return {
      id: "box-fill",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { image: true, text: true, ocr: this.ocr },
    };
  }

  redactText(value: string, policy: RedactionPolicy, context: AdapterContext): Promise<string> {
    return this.text.redactText(value, policy, context);
  }

  async redactFrame(
    frame: RedactableFrame,
    policy: RedactionPolicy,
    context: AdapterContext,
  ): Promise<RedactedFrame> {
    if (policy.mode === "off") return { image: frame.image, regions: [] };
    const regions = clampRegions(
      applyPolicy(await this.detect(frame, policy, context), policy),
      frame,
    );
    if (regions.length === 0) return { image: frame.image, regions: [] };
    return { image: await paint(frame, regions, policy.mode), regions };
  }
}

/** Clip each region to its intersection with the frame; drop any that does not overlap it. */
export function clampRegions(
  regions: readonly RedactionRegion[],
  frame: Pick<RedactableFrame, "width" | "height">,
): RedactionRegion[] {
  const out: RedactionRegion[] = [];
  for (const region of regions) {
    const left = Math.max(0, region.x);
    const top = Math.max(0, region.y);
    const right = Math.min(region.x + region.w, frame.width);
    const bottom = Math.min(region.y + region.h, frame.height);
    const w = right - left;
    const h = bottom - top;
    if (w > 0 && h > 0) out.push({ ...region, x: left, y: top, w, h });
  }
  return out;
}

async function paint(
  frame: RedactableFrame,
  regions: readonly RedactionRegion[],
  mode: "box-fill" | "blur",
): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  const source = Buffer.from(frame.image);
  const format = frame.mimeType === "image/jpeg" ? "jpeg" : "png";

  if (mode === "blur") {
    const overlays = await Promise.all(
      regions.map(async (region) => ({
        input: await sharp(source)
          .extract({ left: region.x, top: region.y, width: region.w, height: region.h })
          .blur(12)
          .toBuffer(),
        left: region.x,
        top: region.y,
      })),
    );
    return new Uint8Array(await sharp(source).composite(overlays).toFormat(format).toBuffer());
  }

  const fills = await Promise.all(
    regions.map(async (region) => ({
      input: await sharp({
        create: {
          width: region.w,
          height: region.h,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        },
      })
        .png()
        .toBuffer(),
      left: region.x,
      top: region.y,
    })),
  );
  return new Uint8Array(await sharp(source).composite(fills).toFormat(format).toBuffer());
}
