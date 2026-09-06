/**
 * A token-aware prompt assembler. The caller renders every section at full size; `planPrompt`
 * then fits them to the model's context window: required sections always stay, the rest are
 * trimmed or dropped by ascending priority, and a one-line-per-section report says where the
 * window went. It replaces per-source character caps scattered across the run setup.
 */

export interface PromptSectionInput {
  name: string;
  text: string;
  /** Lower priority is trimmed, then dropped, first. The current user turn should be highest. */
  priority: number;
  /** Never trimmed. If the required sections alone exceed the window, `overflowed` is set. */
  required?: boolean;
  /** Shrink `text` to about `budgetTokens`. Defaults to a hard character cut with a marker. */
  trim?: (text: string, budgetTokens: number) => string;
}

export interface PlannedSection {
  name: string;
  text: string;
  tokens: number;
  originalTokens: number;
  trimmed: boolean;
  dropped: boolean;
}

export interface PromptPlan {
  /** In the caller's original section order, ready to join. */
  sections: PlannedSection[];
  totalTokens: number;
  /** Required sections did not fit the window even before any flexible section. */
  overflowed: boolean;
  report: string;
}

export interface PlanPromptOptions {
  contextWindow: number;
  /** Held back for the model's reply; never used by prompt sections. */
  reserveForOutput: number;
  /** Provider-neutral ~chars/4 by default. Pass a real tokenizer for accuracy. */
  estimateTokens?: (text: string) => number;
  sections: PromptSectionInput[];
}

const roughTokens = (text: string): number => (text ? Math.ceil(text.length / 4) : 0);

/** Longest prefix of `text` that fits `budgetTokens` under `estimate`, plus a marker. */
function makeHardTrim(estimate: (text: string) => number) {
  return (text: string, budgetTokens: number): string => {
    if (estimate(text) <= budgetTokens) return text;
    const marker = "\n…[trimmed]";
    const target = Math.max(0, budgetTokens - estimate(marker));
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (estimate(text.slice(0, mid)) <= target) lo = mid;
      else hi = mid - 1;
    }
    return `${text.slice(0, lo).trimEnd()}${marker}`;
  };
}

export function planPrompt(options: PlanPromptOptions): PromptPlan {
  const estimate = options.estimateTokens ?? roughTokens;
  const hardTrim = makeHardTrim(estimate);
  const available = Math.max(0, options.contextWindow - options.reserveForOutput);

  const entries = options.sections.map((section, index) => ({
    section,
    index,
    originalTokens: estimate(section.text),
    text: section.text,
    tokens: estimate(section.text),
    trimmed: false,
    dropped: false,
  }));

  const requiredTokens = entries
    .filter((entry) => entry.section.required)
    .reduce((sum, entry) => sum + entry.originalTokens, 0);
  const overflowed = requiredTokens > available;

  let remaining = Math.max(0, available - requiredTokens);

  for (const entry of [...entries]
    .filter((entry) => !entry.section.required)
    .sort((a, b) => b.section.priority - a.section.priority)) {
    if (entry.originalTokens <= remaining) {
      remaining -= entry.originalTokens;
      continue;
    }
    if (remaining <= 0) {
      entry.text = "";
      entry.tokens = 0;
      entry.dropped = true;
      entry.trimmed = true;
      continue;
    }
    const trim = entry.section.trim ?? hardTrim;
    entry.text = trim(entry.text, remaining);
    entry.tokens = estimate(entry.text);
    entry.trimmed = true;
    remaining = Math.max(0, remaining - entry.tokens);
  }

  const sections: PlannedSection[] = entries
    .sort((a, b) => a.index - b.index)
    .map((entry) => ({
      name: entry.section.name,
      text: entry.text,
      tokens: entry.tokens,
      originalTokens: entry.originalTokens,
      trimmed: entry.trimmed,
      dropped: entry.dropped,
    }));

  const totalTokens = sections.reduce((sum, section) => sum + section.tokens, 0);
  const report = [
    `window ${options.contextWindow} − reserve ${options.reserveForOutput} = ${available} available`,
    ...sections.map((section) => {
      const state = section.dropped ? " dropped" : section.trimmed ? " trimmed" : "";
      return `  ${section.name}: ${section.tokens}/${section.originalTokens} tok${state}`;
    }),
    `  total ${totalTokens}${overflowed ? " — OVERFLOW: required sections exceed the window" : ""}`,
  ].join("\n");

  return { sections, totalTokens, overflowed, report };
}
