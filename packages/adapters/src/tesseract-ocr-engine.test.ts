import { describe, expect, it, vi } from "vitest";
import { createTesseractOcrEngine, type OcrWorker } from "./tesseract-ocr-engine.js";

const IMG = new Uint8Array([1, 2, 3]);

function worker(data: unknown): OcrWorker {
  return { recognize: vi.fn().mockResolvedValue({ data }) };
}

describe("createTesseractOcrEngine", () => {
  it("maps flat word output and drops low-confidence / blank words", async () => {
    const engine = createTesseractOcrEngine(async () =>
      worker({
        words: [
          { text: "alice@corp.com", confidence: 92, bbox: { x0: 4, y0: 4, x1: 90, y1: 16 } },
          { text: "blurry", confidence: 12, bbox: { x0: 0, y0: 20, x1: 30, y1: 32 } },
          { text: "   ", confidence: 99, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } },
        ],
      }),
    );
    const words = await engine(IMG, "image/png");
    expect(words).toEqual([{ text: "alice@corp.com", bbox: { x0: 4, y0: 4, x1: 90, y1: 16 } }]);
  });

  it("reads the v6 blocks shape when there is no flat words array", async () => {
    const engine = createTesseractOcrEngine(async () =>
      worker({
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    words: [
                      {
                        text: "123-45-6789",
                        confidence: 88,
                        bbox: { x0: 1, y0: 1, x1: 40, y1: 12 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    const words = await engine(IMG, "image/png");
    expect(words).toEqual([{ text: "123-45-6789", bbox: { x0: 1, y0: 1, x1: 40, y1: 12 } }]);
  });

  it("creates the worker once and reuses it across calls", async () => {
    const loadWorker = vi.fn(async () => worker({ words: [] }));
    const engine = createTesseractOcrEngine(loadWorker);
    await engine(IMG, "image/png");
    await engine(IMG, "image/png");
    expect(loadWorker).toHaveBeenCalledOnce();
  });
});
