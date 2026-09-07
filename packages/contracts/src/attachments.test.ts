import { describe, expect, it } from "vitest";
import {
  isAllowedAttachmentMimeType,
  isAttachmentImageMimeType,
  MessageBlock,
  normalizeAttachmentMimeType,
  validateThreadsSendInput,
} from "./index.js";

describe("attachment contracts", () => {
  it("parses image and file message blocks", () => {
    expect(
      MessageBlock.parse({
        kind: "image",
        artifactId: "art_1",
        mimeType: "image/png",
        name: "shot.png",
      }),
    ).toMatchObject({ kind: "image", name: "shot.png" });
    expect(
      MessageBlock.parse({
        kind: "file",
        artifactId: "art_2",
        mimeType: "application/pdf",
        name: "brief.pdf",
        size: 1234,
      }),
    ).toMatchObject({ kind: "file", size: 1234 });
  });

  it("accepts any well-formed mime type and treats raster images as images", () => {
    expect(isAllowedAttachmentMimeType("application/zip")).toBe(true);
    expect(
      isAllowedAttachmentMimeType(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(true);
    expect(
      isAllowedAttachmentMimeType(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
    expect(isAllowedAttachmentMimeType("image/png")).toBe(true);
    expect(isAllowedAttachmentMimeType("image/png; charset=binary")).toBe(true);
    expect(isAllowedAttachmentMimeType("not-a-type")).toBe(false);
    expect(isAllowedAttachmentMimeType("")).toBe(false);
    expect(normalizeAttachmentMimeType("image/JPG")).toBe("image/jpeg");
    expect(isAttachmentImageMimeType("image/png")).toBe(true);
    expect(isAttachmentImageMimeType("application/zip")).toBe(false);
    expect(isAttachmentImageMimeType("image/svg+xml")).toBe(false);
  });

  it("requires text or attachments for threads.send", () => {
    expect(validateThreadsSendInput({ text: "hello" })).toBe(true);
    expect(validateThreadsSendInput({ artifactIds: ["art_1"] })).toBe(true);
    expect(validateThreadsSendInput({})).toBe(false);
    expect(validateThreadsSendInput({ artifactIds: ["a", "b", "c", "d", "e"] })).toBe(true);
  });
});
