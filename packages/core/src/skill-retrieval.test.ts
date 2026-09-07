import { describe, expect, it } from "vitest";
import {
  applyOutcomeToStats,
  EMPTY_SKILL_STATS,
  rankSkills,
  skillSuccessRate,
} from "./skill-retrieval.js";

describe("applyOutcomeToStats", () => {
  it("counts uses always and successes/failures by outcome", () => {
    let s = EMPTY_SKILL_STATS;
    s = applyOutcomeToStats(s, "verified", "2026-09-07T00:00:00.000Z");
    s = applyOutcomeToStats(s, "contradicted", "2026-09-07T01:00:00.000Z");
    s = applyOutcomeToStats(s, "needs_review", "2026-09-07T02:00:00.000Z");
    expect(s).toEqual({
      uses: 3,
      successCount: 1,
      failCount: 1,
      lastUsedAt: "2026-09-07T02:00:00.000Z",
    });
  });
});

describe("skillSuccessRate", () => {
  it("is 0.5 for an unused skill", () => {
    expect(skillSuccessRate(EMPTY_SKILL_STATS)).toBe(0.5);
  });

  it("discounts a tiny sample toward 0.5", () => {
    const oneWin = skillSuccessRate({ uses: 1, successCount: 1, failCount: 0 });
    const manyWins = skillSuccessRate({ uses: 20, successCount: 20, failCount: 0 });
    expect(oneWin).toBeGreaterThan(0.5);
    expect(oneWin).toBeLessThan(0.7);
    expect(manyWins).toBeGreaterThan(0.9);
  });

  it("drops below 0.5 for a failing skill", () => {
    expect(skillSuccessRate({ uses: 10, successCount: 2, failCount: 8 })).toBeLessThan(0.4);
  });
});

describe("rankSkills", () => {
  const skills = [
    {
      name: "Refund a customer order",
      description: "Issue a refund in Stripe and email the buyer",
    },
    { name: "Weekly sales digest", description: "Summarise the week's revenue and post to Slack" },
    { name: "Onboard a teammate", description: "Create accounts and send the welcome pack" },
  ];

  it("returns only skills that share a word with the query, best first", () => {
    const ranked = rankSkills({ query: "please refund this Stripe order", skills });
    expect(ranked.map((r) => r.skill.name)).toEqual(["Refund a customer order"]);
    expect(ranked[0]?.relevance).toBeGreaterThan(0);
  });

  it("weights a name hit above a description hit", () => {
    const ranked = rankSkills({
      query: "sales revenue report",
      skills,
      limit: 5,
    });
    expect(ranked[0]?.skill.name).toBe("Weekly sales digest");
  });

  it("returns nothing for an empty or all-stopword query", () => {
    expect(rankSkills({ query: "the a to of", skills })).toEqual([]);
    expect(rankSkills({ query: "", skills })).toEqual([]);
  });

  it("breaks a relevance tie by success rate", () => {
    const tied = [
      {
        name: "Deploy web",
        description: "ship the site",
        stats: { uses: 8, successCount: 1, failCount: 7 },
      },
      {
        name: "Deploy api",
        description: "ship the service",
        stats: { uses: 8, successCount: 7, failCount: 1 },
      },
    ];
    const ranked = rankSkills({ query: "deploy ship", skills: tied, limit: 5 });
    expect(ranked.map((r) => r.skill.name)).toEqual(["Deploy api", "Deploy web"]);
  });

  it("honours the limit", () => {
    const ranked = rankSkills({
      query: "refund sales onboard order revenue welcome",
      skills,
      limit: 2,
    });
    expect(ranked).toHaveLength(2);
  });
});
