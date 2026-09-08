/**
 * Optional feature: bind-mount a bot's allow-listed host folders into its
 * sandbox container. It widens the sandbox boundary (a bot gets real read/write
 * on real user directories), so it is off unless a deployment sets
 * `RAKAZO_BOT_FOLDER_MOUNTS` and stays scoped to Private (dedicated) computers,
 * whose container belongs to exactly one bot.
 */
export const BOT_FOLDER_MOUNT_ROOT = "/mnt/folders";

export function botFolderMountsEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return /^(1|true|yes|on)$/i.test((env.RAKAZO_BOT_FOLDER_MOUNTS ?? "").trim());
}

/** Last path segment, tolerating Windows separators and drive roots. */
export function hostPathBasename(hostPath: string): string {
  const segments = hostPath
    .replace(/[\\/]+$/, "")
    .split(/[\\/]+/)
    .filter(Boolean);
  const last = segments.at(-1) ?? "";
  // "C:" -> "c"; keep it usable as a mount folder name.
  return last.replace(/:$/, "").toLowerCase() || "folder";
}

function safeMountName(raw: string): string {
  return (
    raw
      .replace(/[^a-zA-Z0-9_.-]/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "folder"
  );
}

export interface BotFolderMount {
  hostPath: string;
  /** Absolute path the folder is mounted at inside the container. */
  containerPath: string;
}

/**
 * Resolve the container mount point for each host folder. Names collide-proof:
 * two folders that share a basename get `-2`, `-3` suffixes, deterministically
 * by input order so the supervisor and the agent instruction agree.
 */
export function botFolderMounts(hostPaths: readonly string[]): BotFolderMount[] {
  const used = new Set<string>();
  const mounts: BotFolderMount[] = [];
  for (const hostPath of hostPaths) {
    const trimmed = hostPath.trim();
    if (!trimmed) continue;
    const base = safeMountName(hostPathBasename(trimmed));
    let name = base;
    for (let n = 2; used.has(name); n += 1) name = `${base}-${n}`;
    used.add(name);
    mounts.push({ hostPath: trimmed, containerPath: `${BOT_FOLDER_MOUNT_ROOT}/${name}` });
  }
  return mounts;
}

/**
 * Order-independent fingerprint of a folder set. The supervisor stamps it on the
 * container so a later folder change forces a recreate (mounts cannot be added
 * to a running container). Not security-sensitive — only used to notice change —
 * so a small non-crypto digest keeps this module browser-safe.
 */
export function botFolderSpecHash(hostPaths: readonly string[]): string {
  const normalized = [...new Set(hostPaths.map((p) => p.trim()).filter(Boolean))].sort();
  if (normalized.length === 0) return "none";
  const input = JSON.stringify(normalized);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
