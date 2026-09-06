import { type RankedSkill, type RetrievableSkill, rankSkills, type SkillStats } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { BUILTIN_AGENT_SKILLS } from "./builtin-skills.js";

/** How many skills a run pulls into context by relevance. */
export const SKILL_RETRIEVAL_DEFAULT_LIMIT = 3;

export interface RetrievedSkill extends RetrievableSkill {
  id: string;
  source: "user" | "builtin" | "plugin";
  stats: SkillStats;
}

type AgentSkillStatsRow = {
  id: string;
  name: string;
  description: string;
  source: string;
  uses: number;
  successCount: number;
  failCount: number;
  lastUsedAt: Date | null;
};

function toRetrieved(row: AgentSkillStatsRow): RetrievedSkill {
  const source =
    row.source === "builtin" || row.source === "plugin" || row.source === "user"
      ? row.source
      : "user";
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source,
    stats: {
      uses: row.uses,
      successCount: row.successCount,
      failCount: row.failCount,
      ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
    },
  };
}

const BUILTIN_RETRIEVED: RetrievedSkill[] = BUILTIN_AGENT_SKILLS.map((skill) => ({
  id: `builtin:${skill.name}`,
  name: skill.name,
  description: skill.description,
  source: "builtin" as const,
  stats: { uses: 0, successCount: 0, failCount: 0 },
}));

/**
 * The skills most relevant to a task, by lexical overlap and health. Builtins are always in
 * the pool; user skills come from the store with their stats. Returns [] for an empty query
 * so callers can fall back to explicit `/Name` invocation only.
 */
export async function retrieveSkillsForTask(
  prisma: Pick<PrismaClient, "agentSkill">,
  owner: { workspaceId: string; userId: string },
  input: { query: string; limit?: number },
): Promise<Array<RankedSkill<RetrievedSkill>>> {
  const rows = (await prisma.agentSkill.findMany({
    where: { workspaceId: owner.workspaceId, userId: owner.userId },
    select: {
      id: true,
      name: true,
      description: true,
      source: true,
      uses: true,
      successCount: true,
      failCount: true,
      lastUsedAt: true,
    },
  })) as AgentSkillStatsRow[];

  return rankSkills({
    query: input.query,
    skills: [...BUILTIN_RETRIEVED, ...rows.map(toRetrieved)],
    limit: input.limit ?? SKILL_RETRIEVAL_DEFAULT_LIMIT,
  });
}
