import { describe, expect, it } from "vitest";
import { invokedUserSkillIds, selectCatalogSkills, skillOutcomeFromRun } from "./skill-catalog.js";

function skill(id: string, name: string, description: string, source = "user") {
  return { id, name, description, source };
}

const many = [
  skill("s1", "Refund a Stripe charge", "Issue a refund and email the buyer"),
  skill("s2", "Weekly sales digest", "Summarise revenue and post to Slack"),
  skill("s3", "Onboard a teammate", "Create accounts and send the welcome pack"),
  skill("s4", "Rotate API keys", "Cycle credentials for a connected service"),
  skill("s5", "Draft a changelog", "Turn merged PRs into release notes"),
  skill("s6", "Triage inbox", "Sort new support mail by urgency"),
  skill("s7", "Publish the blog", "Push a markdown post to the site"),
  skill("s8", "Reconcile invoices", "Match payments against open invoices"),
  skill("s9", "Deploy the api", "Ship the service and watch the rollout"),
];

describe("selectCatalogSkills", () => {
  it("keeps every skill at or below the threshold", () => {
    const few = many.slice(0, 5);
    expect(selectCatalogSkills(few, "anything at all", { threshold: 8 })).toHaveLength(5);
  });

  it("narrows to the task-relevant skills once past the threshold", () => {
    const picked = selectCatalogSkills(many, "please refund this Stripe charge", { limit: 3 });
    expect(picked.map((s) => s.name)).toContain("Refund a Stripe charge");
    expect(picked.length).toBeLessThan(many.length);
  });

  it("always keeps an explicitly named skill even when the task does not mention it", () => {
    const picked = selectCatalogSkills(
      many,
      "weekly sales digest report numbers @Rotate API keys",
      { limit: 2 },
    );
    expect(picked.map((s) => s.name)).toContain("Rotate API keys");
    expect(picked.map((s) => s.name)).toContain("Weekly sales digest");
  });

  it("falls back to the first N when nothing matches the task", () => {
    const picked = selectCatalogSkills(many, "xyzzy zork frobnicate", { limit: 4 });
    expect(picked).toHaveLength(4);
  });
});

describe("invokedUserSkillIds", () => {
  it("returns the ids of user skills named in the prompt", () => {
    expect(invokedUserSkillIds(many, "please run @Deploy the api for me")).toEqual(["s9"]);
  });

  it("ignores builtin/plugin skills and unnamed skills", () => {
    const withBuiltin = [
      skill("b1", "Deploy the api", "builtin one", "builtin"),
      ...many.slice(1, -1),
    ];
    expect(invokedUserSkillIds(withBuiltin, "please run @Deploy the api for me")).toEqual([]);
    expect(invokedUserSkillIds(many, "just do something generic")).toEqual([]);
  });
});

describe("skillOutcomeFromRun", () => {
  it("is contradicted when the run was contradicted", () => {
    expect(skillOutcomeFromRun(true, "verified")).toBe("contradicted");
  });

  it("passes the rollup through otherwise, defaulting to unverified", () => {
    expect(skillOutcomeFromRun(false, "verified")).toBe("verified");
    expect(skillOutcomeFromRun(false, "needs_review")).toBe("needs_review");
    expect(skillOutcomeFromRun(false, undefined)).toBe("unverified");
  });
});
