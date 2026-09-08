import { createHash } from "node:crypto";

/**
 * Stable digest of an accessibility-tree snapshot, used as a replay checkpoint. Trailing
 * whitespace and blank lines are normalized so a cosmetically reformatted tree hashes the
 * same; anything that changes which elements are present or their order changes the hash.
 */
export function hashSnapshotTree(tree: string): string {
  const normalized = tree
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line !== "")
    .join("\n");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
