/** Canonical identity files: who the user is, how the bot speaks, how it acts. */

export const USER_IDENTITY_PATH = "USER.md";
export const SOUL_IDENTITY_PATH = "SOUL.md";
export const BOT_IDENTITY_PATH = "IDENTITY.md";

export const IDENTITY_FILE_MAX_CHARS = 20_000;

export type IdentityKind = "user" | "soul" | "identity";
export type MemoryScopeName = "bot" | "user";

const IDENTITY_BASENAME: Record<string, IdentityKind> = {
  "user.md": "user",
  "soul.md": "soul",
  "identity.md": "identity",
};

function basename(path: string): string {
  return path.replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? "";
}

/** Match a document to an identity file only in its canonical scope. */
export function identityKindFor(path: string, scope: MemoryScopeName): IdentityKind | null {
  const kind = IDENTITY_BASENAME[basename(path)];
  if (kind === "user" && scope === "user") return "user";
  if (kind === "soul" && scope === "bot") return "soul";
  if (kind === "identity" && scope === "bot") return "identity";
  return null;
}

export function isIdentityFile(path: string, scope: MemoryScopeName): boolean {
  return identityKindFor(path, scope) !== null;
}

/** USER.md first, then who the bot is, then how it speaks. */
export function identityPromptRank(path: string, scope: MemoryScopeName): number {
  const kind = identityKindFor(path, scope);
  if (kind === "user") return 0;
  if (kind === "identity") return 1;
  if (kind === "soul") return 2;
  return 3;
}

/**
 * `remember` writes bot-scoped Markdown unless the caller sets scope or the
 * path is USER.md (account-wide).
 */
export function rememberScopeForPath(path: string, requested?: string): MemoryScopeName {
  const scope = requested?.trim().toLowerCase();
  if (scope === "user" || scope === "bot") return scope;
  return identityKindFor(path, "user") === "user" ? "user" : "bot";
}

export function userIdentityTemplate(): string {
  return `# You

Who you are, how you work, and how you want problems framed.

- Role:
- Style:
- Values:
`;
}

export function soulIdentityTemplate(): string {
  return `# Voice

How this bot speaks.

- Tone: direct, brief
- Avoid: filler, hedging, corporate phrasing
- Challenge: push back when the idea is weak
`;
}

export function botIdentityTemplate(input: {
  name: string;
  title?: string;
  description?: string;
}): string {
  const name = input.name.trim() || "Bot";
  const job = input.title?.trim() || input.description?.trim() || "";
  return `# ${name}

Trusted teammate. Not an assistant that just executes — an advisor that thinks alongside you.

- Job:${job ? ` ${job}` : ""}
- Lane:
`;
}

export function identityFileTemplate(
  kind: IdentityKind,
  bot?: { name: string; title?: string; description?: string },
): string {
  if (kind === "user") return userIdentityTemplate();
  if (kind === "soul") return soulIdentityTemplate();
  return botIdentityTemplate(bot ?? { name: "Bot" });
}

export function clampIdentityFileContent(content: string): string {
  return content.length <= IDENTITY_FILE_MAX_CHARS
    ? content
    : content.slice(0, IDENTITY_FILE_MAX_CHARS);
}

export const IDENTITY_RUNTIME_INSTRUCTION =
  "USER.md (user scope), IDENTITY.md, and SOUL.md (this bot) are identity files: follow them for who the user is, who you are, and how you speak. Voice in SOUL.md outranks the default brevity guidance. When the user asks you to learn who they are, how you should speak, or who you are to them, interview them, then write the matching file with remember (USER.md is user scope; the other two are bot scope). Don't interview unprompted.";
