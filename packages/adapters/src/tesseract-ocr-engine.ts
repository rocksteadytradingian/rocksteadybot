import type { OcrEngine, OcrWord } from "./ocr-region-detector.js";

/** The slice of a tesseract.js worker this engine uses. */
export interface OcrWorker {
  recognize(image: Buffer): Promise<{ data: TesseractData }>;
}

interface TesseractWord {
  text: string;
  confidence?: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

interface TesseractData {
  words?: TesseractWord[];
  blocks?: Array<{
    paragraphs?: Array<{ lines?: Array<{ words?: TesseractWord[] }> }>;
  }>;
}

/** tesseract's word confidence runs 0–100; drop the low-confidence noise. */
const MIN_WORD_CONFIDENCE = 40;

/** tesseract.js moved word data under `blocks` in v6; accept either shape. */
function flattenWords(data: TesseractData): TesseractWord[] {
  if (data.words?.length) return data.words;
  const out: TesseractWord[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        for (const word of line.words ?? []) out.push(word);
      }
    }
  }
  return out;
}

async function defaultWorker(): Promise<OcrWorker> {
  const { createWorker } = await import("tesseract.js");
  // First use downloads the English model + wasm, then caches them. Point at bundled assets
  // (langPath / corePath) for a fully offline deployment.
  return (await createWorker("eng")) as unknown as OcrWorker;
}

/**
 * An {@link OcrEngine} backed by tesseract.js. The worker is created once per engine and
 * reused across frames — spin-up is slow. tesseract.js is imported lazily, so nothing loads
 * until the first recognise. Pass `loadWorker` in tests.
 */
export function createTesseractOcrEngine(
  loadWorker: () => Promise<OcrWorker> = defaultWorker,
): OcrEngine {
  let workerPromise: Promise<OcrWorker> | null = null;
  return async (image) => {
    workerPromise ??= loadWorker();
    const worker = await workerPromise;
    const { data } = await worker.recognize(Buffer.from(image));
    return flattenWords(data)
      .filter(
        (word) => word.text.trim().length > 0 && (word.confidence ?? 100) >= MIN_WORD_CONFIDENCE,
      )
      .map(
        (word): OcrWord => ({
          text: word.text,
          bbox: {
            x0: word.bbox.x0,
            y0: word.bbox.y0,
            x1: word.bbox.x1,
            y1: word.bbox.y1,
          },
        }),
      );
  };
}

/** Shared production engine. */
export const tesseractOcrEngine: OcrEngine = createTesseractOcrEngine();
