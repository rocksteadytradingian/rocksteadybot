/**
 * After a run finishes, a cheap model reads the transcript and proposes durable memories:
 * facts, preferences, and — when the run failed or its outcome could not be confirmed —
 * "guard" memories that keep the same mistake from recurring. This module builds that prompt,
 * parses the reply, and saves what survives. It never blocks a run; the job runs in the
 * background.
 */

export type ReflectionScope = "bot" | "user" | "workspace";
export type ReflectionKind = "fact" | "preference" | "guard";

export interface ReflectedMemory {
  scope: ReflectionScope;
  kind: ReflectionKind;
  /** One sentence, self-contained. */
  text: string;
  /** Where in the run this came from. */
  evidence?: string;
}

export type RunOutcomeForReflection = "succeeded" | "failed" | "needs_review" | "unknown";

export interface ReflectionInput {
  transcript: string;
  outcome: RunOutcomeForReflection;
  /** Cap on memories kept from one run. */
  maxMemories?: number;
}

const DEFAULT_MAX = 6;

export function buildReflectionPrompt(input: ReflectionInput): string {
  const guardLine =
    input.outcome === "failed" || input.outcome === "needs_review"
      ? `This run ${input.outcome === "failed" ? "failed" : "could not be confirmed"}. Include at least one "guard" memory: "when <situation>, do not assume <X> — last time that failed because <Y>".`
      : `Only add a "guard" memory if the run revealed a real trap for next time.`;

  return [
    "You are distilling durable memory from one completed task. Return a JSON array; each item is",
    '{ "scope": "bot" | "user" | "workspace", "kind": "fact" | "preference" | "guard", "text": "<one self-contained sentence>", "evidence": "<short quote or step>" }.',
    "Rules:",
    "- Only things worth recalling on a *future, similar* task. No play-by-play, no restating the request.",
    "- A preference is something the user wants done a certain way. A fact is stable state (an id, a path, a name).",
    `- ${guardLine}`,
    `- At most ${input.maxMemories ?? DEFAULT_MAX} items. Fewer is better. Empty array if nothing is durable.`,
    "",
    `Run outcome: ${input.outcome}`,
    "Transcript:",
    input.transcript,
  ].join("\n");
}

/** Tolerant parse of the model's reply: a JSON array, or JSON objects one per line. */
export function parseReflection(reply: string, options: { max?: number } = {}): ReflectedMemory[] {
  const max = options.max ?? DEFAULT_MAX;
  const raw: unknown[] = [];

  const arrayMatch = reply.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) raw.push(...parsed);
    } catch {
      // fall through to line parsing
    }
  }
  if (raw.length === 0) {
    for (const line of reply.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        raw.push(JSON.parse(trimmed));
      } catch {
        // skip
      }
    }
  }

  const seen = new Set<string>();
  const out: ReflectedMemory[] = [];
  for (const entry of raw) {
    const memory = coerce(entry);
    if (!memory) continue;
    const key = memory.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(memory);
    if (out.length >= max) break;
  }
  return out;
}

function coerce(value: unknown): ReflectedMemory | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.trim() : "";
  if (text.length < 3) return null;
  const scope: ReflectionScope =
    record.scope === "user" || record.scope === "workspace" ? record.scope : "bot";
  const kind: ReflectionKind =
    record.kind === "preference" || record.kind === "guard" ? record.kind : "fact";
  const evidence = typeof record.evidence === "string" ? record.evidence.trim() : undefined;
  return { scope, kind, text, evidence: evidence || undefined };
}

export interface ReflectOnRunArgs {
  input: ReflectionInput;
  /** Runs the reflection prompt through a cheap model. */
  ask: (prompt: string) => Promise<string>;
  /** Persists one distilled memory (e.g. via SemanticMemoryProvider.save). */
  save: (memory: ReflectedMemory) => Promise<void>;
}

export interface ReflectOnRunResult {
  memories: ReflectedMemory[];
  saved: number;
}

/** Reflect on one run and persist what survives. Errors from `ask` yield an empty result. */
export async function reflectOnRun(args: ReflectOnRunArgs): Promise<ReflectOnRunResult> {
  if (!args.input.transcript.trim()) return { memories: [], saved: 0 };
  let reply: string;
  try {
    reply = await args.ask(buildReflectionPrompt(args.input));
  } catch {
    return { memories: [], saved: 0 };
  }
  const memories = parseReflection(reply, { max: args.input.maxMemories });
  let saved = 0;
  for (const memory of memories) {
    try {
      await args.save(memory);
      saved += 1;
    } catch {
      // one failed save should not abandon the rest
    }
  }
  return { memories, saved };
}
