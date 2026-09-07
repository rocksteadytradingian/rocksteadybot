export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 4;
/** Base64 expands payload by 4/3; cap before decode to reject oversize uploads cheaply. */
export const ATTACHMENT_MAX_BASE64_LENGTH = Math.ceil(ATTACHMENT_MAX_BYTES / 3) * 4;

/** Raster types sent to the model as current-turn images. */
export const ATTACHMENT_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** Common non-image types. Uploads are not limited to this list. */
export const ATTACHMENT_FILE_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
] as const;

export const ATTACHMENT_ALLOWED_MIME_TYPES = [
  ...ATTACHMENT_IMAGE_MIME_TYPES,
  ...ATTACHMENT_FILE_MIME_TYPES,
] as const;

/** Any well-formed `type/subtype` value is accepted for uploads. */
export type AttachmentMimeType = string;

/** Vendor types such as Excel's Open XML MIME can be long; do not cap token length tightly. */
const ATTACHMENT_MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;
const ATTACHMENT_MIME_TYPE_MAX_LENGTH = 200;

export function normalizeAttachmentMimeType(mimeType: string): string {
  const raw = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return raw === "image/jpg" ? "image/jpeg" : raw;
}

export function isAttachmentImageMimeType(mimeType: string): boolean {
  return (ATTACHMENT_IMAGE_MIME_TYPES as readonly string[]).includes(
    normalizeAttachmentMimeType(mimeType),
  );
}

export function isAllowedAttachmentMimeType(mimeType: string): boolean {
  const normalized = normalizeAttachmentMimeType(mimeType);
  return (
    normalized.length > 0 &&
    normalized.length <= ATTACHMENT_MIME_TYPE_MAX_LENGTH &&
    ATTACHMENT_MIME_TYPE_PATTERN.test(normalized)
  );
}

export function validateThreadsSendInput(input: {
  text?: string;
  artifactIds?: string[];
}): boolean {
  const text = input.text?.trim() ?? "";
  const artifactIds = input.artifactIds ?? [];
  return Boolean(text || artifactIds.length);
}
