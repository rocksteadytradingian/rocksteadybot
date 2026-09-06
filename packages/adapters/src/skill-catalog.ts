import {
  extractForcedSkillName,
  extractRoutineSkillMentions,
  rankSkills,
  type SkillOutcome,
} from "@rakazo/core";

/**
 * Which skills to show the model, and which ones a run leaned on. The executor holds the run
 * state; this module is the pure selection logic so it can be tested on its own.
 */

export const SKILL_CATALOG_RANK_THRESHOLD = 8;
export const SKILL_CATALOG_RANK_LIMIT = 6;

type CatalogSkill = { id: string; name: string; description: string; source: string };

function referencedNames<T extends { name: string }>(
  taskPrompt: string,
  skills: readonly T[],
): Set<string> {
  return new Set(
    [
      extractForcedSkillName(taskPrompt)?.name,
      ...extractRoutineSkillMentions(
        taskPrompt,
        skills.map((skill) => skill.name),
      ),
    ]
      .filter((name): name is string => Boolean(name))
      .map((name) => name.toLowerCase()),
  );
}

/**
 * Past `threshold` skills, keep only the `limit` most relevant to the task plus any the
 * prompt names explicitly. At or below the threshold every skill is kept.
 */
export function selectCatalogSkills<T extends CatalogSkill>(
  skills: readonly T[],
  taskPrompt: string,
  options: { threshold?: number; limit?: number } = {},
): T[] {
  const threshold = options.threshold ?? SKILL_CATALOG_RANK_THRESHOLD;
  const limit = options.limit ?? SKILL_CATALOG_RANK_LIMIT;
  if (skills.length <= threshold) return [...skills];

  const named = referencedNames(taskPrompt, skills);
  const ranked = new Set(
    rankSkills({ query: taskPrompt, skills, limit }).map((entry) => entry.skill.name.toLowerCase()),
  );
  const picked = skills.filter(
    (skill) => ranked.has(skill.name.toLowerCase()) || named.has(skill.name.toLowerCase()),
  );
  return picked.length > 0 ? picked : [...skills].slice(0, limit);
}

/** Ids of the writable (user) skills the prompt invoked by name. */
export function invokedUserSkillIds<T extends CatalogSkill>(
  skills: readonly T[],
  taskPrompt: string,
): string[] {
  const named = referencedNames(taskPrompt, skills);
  return skills
    .filter((skill) => skill.source === "user" && named.has(skill.name.toLowerCase()))
    .map((skill) => skill.id);
}

/** How a finished run's verification maps onto a skill's stat counters. */
export function skillOutcomeFromRun(
  contradicted: boolean,
  rolledUp: SkillOutcome | undefined,
): SkillOutcome {
  if (contradicted) return "contradicted";
  return rolledUp ?? "unverified";
}
