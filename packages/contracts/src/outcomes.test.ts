import { describe, expect, it } from "vitest";
import {
  OutcomeClaimSchema,
  RunOutcomeSchema,
  rollUpVerdicts,
  type Verdict,
  VerdictSchema,
} from "./outcomes.js";

const CHECKED_AT = "2026-09-06T12:00:00.000Z";

function verdict(status: Verdict["status"], overrides: Partial<Verdict> = {}): Verdict {
  return {
    claim: { kind: "file-exists", path: "/home/rakazo/out.csv" },
    status,
    tier: "assertion",
    checkedAt: CHECKED_AT,
    evidence: "",
    ...overrides,
  };
}

describe("outcome claim contracts", () => {
  it("parses each claim kind", () => {
    expect(OutcomeClaimSchema.parse({ kind: "file-exists", path: "/x", minBytes: 10 }).kind).toBe(
      "file-exists",
    );
    expect(OutcomeClaimSchema.parse({ kind: "text-on-screen", pattern: "Saved" }).kind).toBe(
      "text-on-screen",
    );
    expect(
      OutcomeClaimSchema.parse({
        kind: "http-ok",
        method: "GET",
        url: "https://example.test/health",
        jsonPath: "status",
        equals: "ok",
      }).kind,
    ).toBe("http-ok");
    expect(
      OutcomeClaimSchema.parse({
        kind: "connector-record",
        connector: "google-sheets",
        query: "row where A='Q3'",
      }).kind,
    ).toBe("connector-record");
    expect(
      OutcomeClaimSchema.parse({ kind: "model-judgement", question: "Did it post?" }).kind,
    ).toBe("model-judgement");
  });

  it("rejects an unknown claim kind and a malformed url", () => {
    expect(() => OutcomeClaimSchema.parse({ kind: "vibes", ok: true })).toThrow();
    expect(() =>
      OutcomeClaimSchema.parse({ kind: "http-ok", method: "GET", url: "not a url" }),
    ).toThrow();
  });

  it("requires an ISO-8601 checkedAt on a verdict", () => {
    expect(() => VerdictSchema.parse(verdict("verified", { checkedAt: "yesterday" }))).toThrow();
    expect(VerdictSchema.parse(verdict("verified")).status).toBe("verified");
  });
});

describe("rollUpVerdicts", () => {
  it("returns unverified when nothing was claimed", () => {
    expect(rollUpVerdicts([])).toBe("unverified");
  });

  it("returns verified only when every claim passed", () => {
    expect(rollUpVerdicts([verdict("verified"), verdict("verified")])).toBe("verified");
  });

  it("routes to needs_review on an unconfirmed claim", () => {
    expect(rollUpVerdicts([verdict("verified"), verdict("unconfirmed")])).toBe("needs_review");
  });

  it("lets a contradiction outrank an unconfirmed claim", () => {
    expect(rollUpVerdicts([verdict("unconfirmed"), verdict("contradicted")])).toBe("contradicted");
  });

  it("feeds a self-describing RunOutcome", () => {
    const verdicts = [verdict("contradicted", { evidence: "no row matched" })];
    const parsed = RunOutcomeSchema.parse({
      runId: "run-1",
      verdicts,
      rolledUp: rollUpVerdicts(verdicts),
    });
    expect(parsed.rolledUp).toBe("contradicted");
    expect(parsed.verdicts[0]?.claim.kind).toBe("file-exists");
  });
});
