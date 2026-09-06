/**
 * Skill retrieval and health.
 *
 * Today a saved skill is reached only by an exact name + verb match (`promptInvokesSkill`).
 * Past a handful of skills that misses the relevant one. This module ranks skills by lexical
 * relevance to the task and by how well they have worked, so a run can pull the top few into
 * context. A real embedding index is a later swap — the ranking contract here stays the same.
 */

export interface SkillStats {
  /** Times the skill was invoked. */
  uses: number;
  /** Runs that invoked it and verified their outcome. */
  successCount: number;
  /** Runs that invoked it and were contradicted (or user-corrected). */
  failCount: number;
  lastUsedAt?: string;
}

export const EMPTY_SKILL_STATS: SkillStats = { uses: 0, successCount: 0, failCount: 0 };

/** Outcome of a run that invoked a skill — the values `rollUpVerdicts` / an outcome column carry. */
export type SkillOutcome = "verified" | "contradicted" | "needs_review" | "unverified";

/** Fold one run's outcome into a skill's running stats. */
export function applyOutcomeToStats(
  stats: SkillStats,
  outcome: SkillOutcome,
  at: string,
): SkillStats {
  return {
    uses: stats.uses + 1,
    successCount: stats.successCount + (outcome === "verified" ? 1 : 0),
    failCount: stats.failCount + (outcome === "contradicted" ? 1 : 0),
    lastUsedAt: at,
  };
}

/**
 * A 0–1 health score. Unused skills sit at 0.5 (unknown, not bad); a skill with a record
 * trends toward its verified ratio, discounted while the sample is tiny.
 */
export function skillSuccessRate(stats: SkillStats): number {
  const judged = stats.successCount + stats.failCount;
  if (judged === 0) return 0.5;
  const raw = stats.successCount / judged;
  // Pull toward 0.5 until ~5 judged runs so one lucky/unlucky run doesn't dominate ties.
  const confidence = judged / (judged + 4);
  return 0.5 + (raw - 0.5) * confidence;
}

const WORD = /[\p{L}\p{N}]+/gu;
const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "for",
  "of",
  "in",
  "on",
  "with",
  "my",
  "me",
  "please",
  "then",
  "this",
  "that",
  "it",
  "is",
  "be",
  "as",
  "at",
  "by",
  "from",
]);

function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const match of text.toLowerCase().matchAll(WORD)) {
    const word = match[0];
    if (word.length > 1 && !STOP.has(word)) out.push(word);
  }
  return out;
}

export interface RetrievableSkill {
  name: string;
  description: string;
  stats?: SkillStats;
}

export interface RankedSkill<T extends RetrievableSkill> {
  skill: T;
  /** Lexical relevance of the query to the skill, 0 when nothing overlaps. */
  relevance: number;
  successRate: number;
}

/**
 * Rank skills against a task string. Relevance is token overlap of the query with the skill's
 * name (weighted heavily) and description. Skills with zero overlap are dropped. Ties break by
 * success rate, then recent use.
 */
export function rankSkills<T extends RetrievableSkill>(input: {
  query: string;
  skills: readonly T[];
  limit?: number;
}): Array<RankedSkill<T>> {
  const queryTokens = new Set(tokenize(input.query));
  if (queryTokens.size === 0) return [];

  const ranked: Array<RankedSkill<T>> = [];
  for (const skill of input.skills) {
    const nameTokens = new Set(tokenize(skill.name));
    const descTokens = new Set(tokenize(skill.description));
    let hitName = 0;
    let hitDesc = 0;
    for (const token of queryTokens) {
      if (nameTokens.has(token)) hitName += 1;
      else if (descTokens.has(token)) hitDesc += 1;
    }
    if (hitName === 0 && hitDesc === 0) continue;
    // Name matches are 3× a description match; normalise by the query length so a short
    // query can still score 1.0 on a clean hit.
    const relevance = Math.min(1, (hitName * 3 + hitDesc) / (queryTokens.size * 3));
    ranked.push({
      skill,
      relevance,
      successRate: skillSuccessRate(skill.stats ?? EMPTY_SKILL_STATS),
    });
  }

  ranked.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    if (b.successRate !== a.successRate) return b.successRate - a.successRate;
    const aUsed = a.skill.stats?.lastUsedAt ?? "";
    const bUsed = b.skill.stats?.lastUsedAt ?? "";
    if (aUsed !== bUsed) return bUsed.localeCompare(aUsed);
    return a.skill.name.localeCompare(b.skill.name);
  });

  const limit = input.limit ?? 3;
  return limit >= 0 ? ranked.slice(0, limit) : ranked;
}
