import type { ComputerRef, OutcomeClaim, OutcomeVerifyContext } from "@rakazo/adapter-kit";
import { rollUpVerdicts } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { FakeOutcomeVerifier, outcomeClaimKey } from "./fake-outcome-verifier.js";

const COMPUTER: ComputerRef = {
  id: "computer-1",
  botId: "bot-1",
  kind: "fake",
  providerRef: "ref-1",
};

function context(overrides: Partial<OutcomeVerifyContext> = {}): OutcomeVerifyContext {
  return {
    operationId: "op-1",
    traceId: "trace-1",
    workspaceId: "ws-1",
    userId: "user-1",
    signal: new AbortController().signal,
    ...overrides,
  };
}

const FILE_CLAIM: OutcomeClaim = { kind: "file-exists", path: "/home/rakazo/out.csv" };
const SCREEN_CLAIM: OutcomeClaim = { kind: "text-on-screen", pattern: "Saved" };

describe("FakeOutcomeVerifier", () => {
  it("describes itself as a verifier with ordered tiers", () => {
    const descriptor = new FakeOutcomeVerifier().describe();
    expect(descriptor.id).toBe("fake");
    expect(descriptor.capabilities.tiers[0]).toBe("assertion");
  });

  it("returns the scripted verdict for a claim and records the call", async () => {
    const verifier = new FakeOutcomeVerifier({
      script: { [outcomeClaimKey(FILE_CLAIM)]: { status: "verified", evidence: "file is 4.2 KB" } },
      now: "2026-09-06T12:00:00.000Z",
    });

    const verdict = await verifier.verify(FILE_CLAIM, context());

    expect(verdict).toEqual({
      claim: FILE_CLAIM,
      status: "verified",
      tier: "assertion",
      checkedAt: "2026-09-06T12:00:00.000Z",
      evidence: "file is 4.2 KB",
    });
    expect(verifier.calls).toEqual([{ claim: FILE_CLAIM, hadComputer: false }]);
  });

  it("falls back for an unscripted claim", async () => {
    const verifier = new FakeOutcomeVerifier({ fallback: "contradicted" });
    const verdict = await verifier.verify(FILE_CLAIM, context());
    expect(verdict.status).toBe("contradicted");
  });

  it("defaults an unscripted claim with no fallback to unconfirmed", async () => {
    const verdict = await new FakeOutcomeVerifier().verify(FILE_CLAIM, context());
    expect(verdict.status).toBe("unconfirmed");
  });

  it("cannot confirm a text-on-screen claim without a computer", async () => {
    const verifier = new FakeOutcomeVerifier({
      script: { [outcomeClaimKey(SCREEN_CLAIM)]: "verified" },
    });

    const withoutComputer = await verifier.verify(SCREEN_CLAIM, context());
    expect(withoutComputer.status).toBe("unconfirmed");
    expect(withoutComputer.evidence).toMatch(/no computer/i);

    const withComputer = await verifier.verify(SCREEN_CLAIM, context({ computer: COMPUTER }));
    expect(withComputer.status).toBe("verified");
    expect(verifier.calls.at(-1)?.hadComputer).toBe(true);
  });

  it("keys a claim independent of field order", () => {
    const a = { kind: "http-ok", method: "GET", url: "https://x.test/h" } as OutcomeClaim;
    const b = {
      url: "https://x.test/h",
      method: "GET",
      kind: "http-ok",
    } as unknown as OutcomeClaim;
    expect(outcomeClaimKey(a)).toBe(outcomeClaimKey(b));
  });

  it("drives a run-level rollup", async () => {
    const claims: OutcomeClaim[] = [
      FILE_CLAIM,
      { kind: "http-ok", method: "GET", url: "https://x.test/health" },
    ];
    const verifier = new FakeOutcomeVerifier({
      script: {
        [outcomeClaimKey(claims[0]!)]: "verified",
        [outcomeClaimKey(claims[1]!)]: "unconfirmed",
      },
    });

    const verdicts = await Promise.all(claims.map((claim) => verifier.verify(claim, context())));
    expect(rollUpVerdicts(verdicts)).toBe("needs_review");
  });
});
