import {
  ATTACHMENT_MAX_BASE64_LENGTH,
  ATTACHMENT_MAX_BYTES,
  isAllowedAttachmentMimeType,
  isAttachmentImageMimeType,
  type MessageBlock,
  normalizeAttachmentMimeType,
} from "@rakazo/contracts";

export class AttachmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentValidationError";
  }
}

export function decodeAttachmentBase64(contentBase64: string): Uint8Array {
  const normalized = contentBase64.trim();
  if (!normalized) throw new AttachmentValidationError("Attachment content is empty");
  if (normalized.length > ATTACHMENT_MAX_BASE64_LENGTH) {
    throw new AttachmentValidationError("Attachment exceeds the 10 MiB limit");
  }
  if (
    normalized.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)
  ) {
    throw new AttachmentValidationError("Attachment content is not valid base64");
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(normalized, "base64");
  } catch {
    throw new AttachmentValidationError("Attachment content is not valid base64");
  }
  if (bytes.byteLength === 0) throw new AttachmentValidationError("Attachment content is empty");
  if (bytes.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new AttachmentValidationError("Attachment exceeds the 10 MiB limit");
  }
  return new Uint8Array(bytes);
}

export function validateAttachmentMimeType(mimeType: string): void {
  if (!isAllowedAttachmentMimeType(mimeType)) {
    throw new AttachmentValidationError(`Unsupported attachment type: ${mimeType}`);
  }
}

export function attachmentKindForMimeType(mimeType: string): "image" | "file" {
  return isAttachmentImageMimeType(mimeType) ? "image" : "file";
}

export function messageBlockForArtifact(artifact: {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}): Extract<MessageBlock, { kind: "image" | "file" }> {
  if (attachmentKindForMimeType(artifact.mimeType) === "image") {
    return {
      kind: "image",
      artifactId: artifact.id,
      mimeType: artifact.mimeType,
      name: artifact.name,
    };
  }
  return {
    kind: "file",
    artifactId: artifact.id,
    mimeType: artifact.mimeType,
    name: artifact.name,
    size: artifact.size,
  };
}

export function promptTextForAttachments(
  text: string | undefined,
  artifacts: Array<{ name: string; mimeType: string; size: number }>,
): string {
  const caption = text?.trim() ?? "";
  const notes = artifacts
    .filter((artifact) => !isAttachmentImageMimeType(artifact.mimeType))
    .map(
      (artifact) =>
        `User attached file ${JSON.stringify(artifact.name)} (${artifact.mimeType}, ${artifact.size} bytes).`,
    );
  return [caption, ...notes].filter(Boolean).join("\n\n") || "See attached files.";
}

export function blocksToAgentHistoryText(blocks: MessageBlock[]): string {
  return blocks
    .map((block) => {
      if (block.kind === "text") return block.text;
      if (block.kind === "chart") return `[chart: ${block.name}]`;
      if (block.kind === "image") return `[image: ${block.name}]`;
      if (block.kind === "file") {
        return `[file: ${block.name} (${block.mimeType}, ${block.size} bytes)]`;
      }
      // Keep attribution on peer messages: without it a later turn cannot tell
      // which lines came from another bot rather than the user.
      if (block.kind === "bot_message_received") return `[from ${block.fromBotName}] ${block.text}`;
      if (block.kind === "bot_message_sent") return `[to ${block.toBotName}] ${block.text}`;
      if ("text" in block && typeof block.text === "string") return block.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".zip": "application/zip",
  ".xml": "application/xml",
  ".html": "text/html",
  ".htm": "text/html",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".bin": "application/octet-stream",
};

const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "application/json": ".json",
  "application/zip": ".zip",
  "application/xml": ".xml",
  "text/html": ".html",
  "text/yaml": ".yaml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "application/octet-stream": ".bin",
};

const SAFE_EXTENSION = /^\.[a-z0-9][a-z0-9._-]{0,15}$/;

export function inferAttachmentMimeType(name: string, reportedType?: string): string | null {
  const normalizedReported = reportedType ? normalizeAttachmentMimeType(reportedType) : "";
  const hasName = name.trim().length > 0;
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  const extensionType = extension ? EXTENSION_MIME_TYPES[extension] : undefined;
  // Some browsers and native document pickers report Markdown as text/plain.
  if (
    extensionType === "text/markdown" &&
    (!normalizedReported || normalizedReported === "text/plain")
  ) {
    return extensionType;
  }
  if (normalizedReported && isAllowedAttachmentMimeType(normalizedReported)) {
    return normalizedReported;
  }
  if (extensionType) return extensionType;
  if (hasName) return "application/octet-stream";
  return null;
}

export function attachmentExtensionForMimeType(mimeType: string, name = ""): string {
  const dot = name.lastIndexOf(".");
  if (dot >= 0) {
    const ext = name.slice(dot).toLowerCase();
    if (SAFE_EXTENSION.test(ext)) return ext;
  }
  const normalized = normalizeAttachmentMimeType(mimeType);
  return MIME_TYPE_EXTENSIONS[normalized] ?? "";
}

export function attachmentsForThread<T extends { threadKey: string }>(
  attachments: readonly T[],
  threadKey: string | undefined,
): T[] {
  if (!threadKey) return [];
  return attachments.filter((attachment) => attachment.threadKey === threadKey);
}

export function attachmentsForBot<T extends { botId: string }>(
  attachments: readonly T[],
  botId: string | undefined,
): T[] {
  if (!botId) return [];
  return attachments.filter((attachment) => attachment.botId === botId);
}

export function userTurnBlocksForRun(
  trigger: string,
  runId: string,
  messages: Array<{
    id?: string;
    role: string;
    runId?: string | null;
    blocks: MessageBlock[];
  }>,
  sourceMessageId?: string | null,
): MessageBlock[] | undefined {
  if (trigger !== "user") return undefined;
  return messages.find(
    (message) =>
      message.role === "user" &&
      (sourceMessageId ? message.id === sourceMessageId : message.runId === runId),
  )?.blocks;
}
