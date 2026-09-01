/**
 * Shrink tool results before they re-enter the model context.
 *
 * Inspired by caveman's input-side lesson: billed tokens are dominated by what the
 * model rereads every call (shell logs, JSON dumps), not by how the bot talks.
 * Fail-closed: never return a larger payload, never drop error/stack signal, never
 * invent abbreviations. Originals stay on `details` in the runtime.
 */

export const MAX_TOOL_RESULT_CHARS = 12_000;

const LOG_HEAD_LINES = 20;
const LOG_TAIL_LINES = 40;
const LOG_MIN_LINES = 50;
const LOG_MAX_SIGNAL_LINES = 80;
const ARRAY_HEAD = 4;
const ARRAY_TAIL = 2;
const ARRAY_MIN_COLLAPSE = 10;
const TEXT_HEAD_CHARS = 4_000;
const TEXT_TAIL_CHARS = 4_000;
const MAX_DEPTH = 8;

const SIGNAL_LINE =
  /\b(ERROR|FATAL|CRITICAL|PANIC|FAIL(?:ED|URE)?|EXCEPTION|WARN(?:ING)?|Traceback|npm ERR!)\b/i;
const STACK_LINE = /^\s+at\s+\S+|^\s*File\s+"|^Caused by\b|^-+$/;
const NOISE_LINE =
  /^\s*(?:\[[^\]]+\]\s*)?(?:DEBUG|INFO|TRACE|VERBOSE|NOTICE)\b|^\s*\d{4}-\d{2}-\d{2}[ T].*\b(?:debug|info|verbose)\b/i;
const PROGRESS_LINE =
  /[█▉▊▋▌▍▎▏░▒▓]{6,}|(?:\[[=\-#*]{3,}>?\])\s*\d{1,3}%|^\s*\d{1,3}%\s*(?:complete|done|downloaded)?\b/i;

export function compactToolResultForModel(result: unknown): string {
  try {
    const original = JSON.stringify(result);
    if (!original) return "ok";
    const compacted = JSON.stringify(compactValue(result, 0));
    if (!compacted) return "ok";
    const winner = compacted.length < original.length ? compacted : original;
    return winner.length > MAX_TOOL_RESULT_CHARS
      ? headTailText(winner, MAX_TOOL_RESULT_CHARS)
      : winner;
  } catch {
    return "ok";
  }
}

function compactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return value;
  if (typeof value === "string") return compactText(value);
  if (Array.isArray(value)) return compactArray(value, depth);
  if (value && typeof value === "object") {
    return compactObject(value as Record<string, unknown>, depth);
  }
  return value;
}

function compactObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "stdout" || key === "stderr" || key === "content" || key === "log") {
      next[key] = typeof item === "string" ? compactText(item) : compactValue(item, depth + 1);
      continue;
    }
    if (isSignalKey(key) && typeof item === "string") {
      next[key] = compactText(item);
      continue;
    }
    next[key] = compactValue(item, depth + 1);
  }
  return next;
}

function compactArray(value: unknown[], depth: number): unknown {
  if (value.length < ARRAY_MIN_COLLAPSE) {
    return value.map((item) => compactValue(item, depth + 1));
  }
  const keep = new Set<number>();
  for (let index = 0; index < ARRAY_HEAD; index += 1) keep.add(index);
  for (let index = value.length - ARRAY_TAIL; index < value.length; index += 1) {
    if (index >= 0) keep.add(index);
  }
  for (const [index, item] of value.entries()) {
    if (hasSignalSubtree(item)) keep.add(index);
  }
  if (keep.size >= value.length) {
    return value.map((item) => compactValue(item, depth + 1));
  }
  const collapsed: unknown[] = [];
  let pendingSkip = 0;
  const flushSkip = () => {
    if (pendingSkip > 0) {
      collapsed.push({ _omitted: pendingSkip });
      pendingSkip = 0;
    }
  };
  for (const [index, item] of value.entries()) {
    if (keep.has(index)) {
      flushSkip();
      collapsed.push(compactValue(item, depth + 1));
    } else {
      pendingSkip += 1;
    }
  }
  flushSkip();
  return collapsed;
}

function compactText(value: string): string {
  const trimmed = value.trimEnd();
  if (!trimmed) return value;
  const lines = splitLines(trimmed);
  if (lines.length >= LOG_MIN_LINES || looksLikeLog(lines)) {
    const compacted = compactLogLines(lines);
    if (compacted.length < trimmed.length) return compacted;
  }
  if (trimmed.length <= MAX_TOOL_RESULT_CHARS) return value;
  return headTailText(trimmed, MAX_TOOL_RESULT_CHARS);
}

function compactLogLines(lines: string[]): string {
  const keep = new Set<number>();
  for (let index = 0; index < Math.min(LOG_HEAD_LINES, lines.length); index += 1) {
    keep.add(index);
  }
  for (let index = Math.max(0, lines.length - LOG_TAIL_LINES); index < lines.length; index += 1) {
    keep.add(index);
  }

  let signalKept = 0;
  for (const [index, line] of lines.entries()) {
    if (keep.has(index)) continue;
    if (isNoiseLine(line) || isProgressLine(line)) continue;
    if (isSignalLine(line) && signalKept < LOG_MAX_SIGNAL_LINES) {
      keep.add(index);
      signalKept += 1;
    }
  }

  if (keep.size >= lines.length) return lines.join("\n");

  const kept: string[] = [
    `[compacted log: kept ${keep.size} of ${lines.length} lines (errors, first, last)]`,
  ];
  let pendingSkip = 0;
  const flushSkip = () => {
    if (pendingSkip > 0) {
      kept.push(`[… ${pendingSkip} lines omitted …]`);
      pendingSkip = 0;
    }
  };
  for (const [index, line] of lines.entries()) {
    if (keep.has(index)) {
      flushSkip();
      kept.push(line);
    } else {
      pendingSkip += 1;
    }
  }
  flushSkip();
  return kept.join("\n");
}

function looksLikeLog(lines: string[]): boolean {
  if (lines.length < 20) return false;
  let hits = 0;
  const sample = Math.min(lines.length, 80);
  for (let index = 0; index < sample; index += 1) {
    const line = lines[index]!;
    if (isNoiseLine(line) || isProgressLine(line) || isSignalLine(line) || STACK_LINE.test(line)) {
      hits += 1;
    }
  }
  return hits / sample >= 0.25;
}

function isSignalLine(line: string): boolean {
  return SIGNAL_LINE.test(line) || STACK_LINE.test(line);
}

function isNoiseLine(line: string): boolean {
  return NOISE_LINE.test(line);
}

function isProgressLine(line: string): boolean {
  return PROGRESS_LINE.test(line);
}

function isSignalKey(key: string): boolean {
  return /^(error|errors|message|messages|stack|stderr|exception|cause)$/i.test(key);
}

function hasSignalSubtree(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasSignalSubtree);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isSignalKey(key) && item != null && item !== "") return true;
    if (hasSignalSubtree(item)) return true;
  }
  return false;
}

function splitLines(value: string): string[] {
  return value.split(/\r?\n/);
}

function headTailText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const budget = maxChars - 48;
  if (budget < 64) return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
  const head = Math.min(TEXT_HEAD_CHARS, Math.floor(budget * 0.5));
  const tail = Math.min(TEXT_TAIL_CHARS, budget - head);
  const omitted = Math.max(0, value.length - head - tail);
  const marker = `\n[… ${omitted} chars omitted; errors/tail kept …]\n`;
  const next = `${value.slice(0, head)}${marker}${value.slice(-tail)}`;
  return next.length <= maxChars ? next : `${next.slice(0, Math.max(0, maxChars - 1))}…`;
}
