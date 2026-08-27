export type ClipboardFileSource = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; getAsFile(): File | null }> | null;
};

function extensionForClipboardMime(mimeType: string): string {
  const mime = mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/bmp") return "bmp";
  if (mime.startsWith("image/")) return "png";
  return "bin";
}

export function namedClipboardFile(file: File, now = Date.now()): File {
  const name = file.name?.trim() ?? "";
  if (name && name !== "blob") return file;
  const mime = file.type?.split(";", 1)[0]?.trim().toLowerCase() || "application/octet-stream";
  const ext = extensionForClipboardMime(mime);
  const base = mime.startsWith("image/") ? "screenshot" : "paste";
  return new File([file], `${base}-${now}.${ext}`, { type: mime });
}

export function filesFromDataTransfer(data: ClipboardFileSource | null | undefined): File[] {
  if (!data) return [];
  const fromFiles = Array.from(data.files ?? []).map((file) => namedClipboardFile(file));
  if (fromFiles.length) return fromFiles;
  const fromItems: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) fromItems.push(namedClipboardFile(file));
  }
  return fromItems;
}
