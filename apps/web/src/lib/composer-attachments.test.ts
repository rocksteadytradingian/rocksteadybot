import { describe, expect, it } from "vitest";
import { filesFromDataTransfer, namedClipboardFile } from "./composer-attachments.js";

function pngFile(name: string, type = "image/png"): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type });
}

describe("composer clipboard attachments", () => {
  it("names unnamed screenshot pastes", () => {
    const named = namedClipboardFile(pngFile("", "image/png"), 1_700_000_000_000);
    expect(named.name).toBe("screenshot-1700000000000.png");
    expect(named.type).toBe("image/png");
  });

  it("keeps named files as-is", () => {
    const original = pngFile("shot.png");
    expect(namedClipboardFile(original).name).toBe("shot.png");
  });

  it("reads files from clipboard data, then file items", () => {
    const fromFiles = filesFromDataTransfer({
      files: [pngFile("clip.png")],
      items: [{ kind: "file", getAsFile: () => pngFile("item.png") }],
    });
    expect(fromFiles.map((file) => file.name)).toEqual(["clip.png"]);

    const fromItems = filesFromDataTransfer({
      files: [],
      items: [
        { kind: "string", getAsFile: () => null },
        { kind: "file", getAsFile: () => pngFile("item.png") },
      ],
    });
    expect(fromItems.map((file) => file.name)).toEqual(["item.png"]);

    expect(filesFromDataTransfer(null)).toEqual([]);
  });
});
