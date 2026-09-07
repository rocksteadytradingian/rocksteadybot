import { describe, expect, it } from "vitest";
import { filterPickedAttachments } from "./pick-attachments-filter.js";

describe("filterPickedAttachments", () => {
  it("skips files without a mime type and oversize files, but accepts any valid type", () => {
    const result = filterPickedAttachments(0, [
      {
        name: "notes.txt",
        mimeType: "text/plain",
        size: 12,
        contentBase64: "aGVsbG8=",
      },
      {
        name: "notes.zip",
        mimeType: "application/zip",
        size: 12,
        contentBase64: "aGVsbG8=",
      },
      {
        name: "unknown.bin",
        mimeType: null,
        size: 12,
        contentBase64: "aGVsbG8=",
      },
      {
        name: "big.bin",
        mimeType: "text/plain",
        size: 11 * 1024 * 1024,
        contentBase64: "aGVsbG8=",
      },
    ]);
    expect(result.attachments.map((item) => item.name)).toEqual(["notes.txt", "notes.zip"]);
    expect(result.skipped.map((item) => item.name)).toEqual(["unknown.bin", "big.bin"]);
  });

  it("assigns distinct ids to duplicate files", () => {
    const candidate = {
      name: "notes.txt",
      mimeType: "text/plain",
      size: 12,
      contentBase64: "aGVsbG8=",
    };
    const result = filterPickedAttachments(0, [candidate, candidate]);
    expect(result.attachments.map((attachment) => attachment.id)).toEqual([
      "notes.txt-12-0",
      "notes.txt-12-1",
    ]);
  });
});
