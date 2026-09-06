import type { RedactionPolicy, RedactionRegion } from "@rakazo/adapter-kit";
import type { RegionDetector } from "./box-fill-redactor.js";
import { findEntitySpans } from "./regex-text-redactor.js";

/** One recognised word with its pixel bounding box (tesseract's shape). */
export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

/** Runs OCR over a raster frame. The engine (tesseract.js, a cloud OCR, …) is supplied by the caller. */
export type OcrEngine = (
  image: Uint8Array,
  mimeType: string,
  signal?: AbortSignal,
) => Promise<OcrWord[]>;

/** OCR detections are never certain; leave the confidence floor to the policy. */
const OCR_REGION_SCORE = 0.9;

/**
 * Turn OCR words into redaction regions: group words into lines, run the entity patterns over
 * each line's text, and for every match union the pixel boxes of the words it spans. An entity
 * OCR splits across whitespace (`alice @ corp . com`) is not caught here — that is the regex-
 * over-OCR trade-off; a Presidio-backed detector handles those.
 */
export function detectRegionsFromOcr(
  words: readonly OcrWord[],
  policy: RedactionPolicy,
): RedactionRegion[] {
  const regions: RedactionRegion[] = [];
  for (const line of groupLines(words)) {
    const offsets: number[] = [];
    let lineText = "";
    for (const word of line) {
      offsets.push(lineText.length);
      lineText += `${word.text} `;
    }
    for (const span of findEntitySpans(lineText, policy)) {
      const covered = line.filter((word, i) => {
        const wordStart = offsets[i] as number;
        return wordStart < span.end && wordStart + word.text.length > span.start;
      });
      const box = unionBoxes(covered.map((word) => word.bbox));
      if (box) regions.push({ ...box, entity: span.entity, score: OCR_REGION_SCORE });
    }
  }
  return regions;
}

/** A RegionDetector backed by an OCR engine, for `new BoxFillScreenRedactor({ detect })`. */
export function createOcrRegionDetector(ocr: OcrEngine): RegionDetector {
  return async (frame, policy, context) => {
    if (policy.mode === "off") return [];
    const words = await ocr(frame.image, frame.mimeType, context.signal);
    return detectRegionsFromOcr(words, policy);
  };
}

/** Cluster words into lines by vertical overlap, each line left-to-right. */
function groupLines(words: readonly OcrWord[]): OcrWord[][] {
  const sorted = [...words].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const lines: OcrWord[][] = [];
  for (const word of sorted) {
    const line = lines.find((entries) => {
      const last = entries[entries.length - 1]!;
      const overlap = Math.min(last.bbox.y1, word.bbox.y1) - Math.max(last.bbox.y0, word.bbox.y0);
      const shorter = Math.min(last.bbox.y1 - last.bbox.y0, word.bbox.y1 - word.bbox.y0);
      return overlap > shorter * 0.5;
    });
    if (line) line.push(word);
    else lines.push([word]);
  }
  for (const line of lines) line.sort((a, b) => a.bbox.x0 - b.bbox.x0);
  return lines;
}

function unionBoxes(
  boxes: ReadonlyArray<OcrWord["bbox"]>,
): Pick<RedactionRegion, "x" | "y" | "w" | "h"> | null {
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((b) => b.x0));
  const y0 = Math.min(...boxes.map((b) => b.y0));
  const x1 = Math.max(...boxes.map((b) => b.x1));
  const y1 = Math.max(...boxes.map((b) => b.y1));
  const x = Math.round(x0);
  const y = Math.round(y0);
  return { x, y, w: Math.max(1, Math.round(x1) - x), h: Math.max(1, Math.round(y1) - y) };
}
