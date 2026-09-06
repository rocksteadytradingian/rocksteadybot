import type {
  ComputerFileEntry,
  ComputerObservation,
  ComputerRef,
  OutcomeVerifyContext,
} from "@rakazo/adapter-kit";
import type { RunOutcome } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { FakeOutcomeVerifier, outcomeClaimKey } from "./fake-outcome-verifier.js";
import {
  createSandboxOutcomeVerifier,
  DECLARE_OUTCOME_TOOL,
  declareOutcomeToolResult,
  finalizeRunOutcomes,
  MAX_DECLARED_OUTCOMES,
  parseDeclaredOutcomes,
  summarizeOutcome,
} from "./outcome-run.js";

const COMPUTER: ComputerRef = { id: "c1", botId: "b1", kind: "fake", providerRef: "r1" };

function context(overrides: Partial<OutcomeVerifyContext> = {}): OutcomeVerifyContext {
  return {
    operationId: "op",
    traceId: "tr",
    workspaceId: "ws",
    userId: "u",
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("parseDeclaredOutcomes", () => {
  it("keeps valid claims and reports the invalid ones by position", () => {
    const parsed = parseDeclaredOutcomes({
      claims: [
        { kind: "file-exists", path: "/home/rakazo/out.csv" },
        { kind: "http-ok", method: "GET", url: "nonsense" },
        { kind: "made-up" },
      ],
    });
    expect(parsed.claims).toHaveLength(1);
    expect(parsed.errors).toHaveLength(2);
    expect(parsed.errors[0]).toMatch(/^claim 2:/);
  });

  it("rejects a payload with no claims array", () => {
    expect(parseDeclaredOutcomes({}).errors[0]).toMatch(/needs a "claims" array/);
    expect(parseDeclaredOutcomes(null).claims).toEqual([]);
  });

  it("enforces the per-run cap across calls via existingCount", () => {
    const many = Array.from({ length: 10 }, () => ({ kind: "file-exists", path: "/x" }));
    const parsed = parseDeclaredOutcomes({ claims: many }, MAX_DECLARED_OUTCOMES - 3);
    expect(parsed.claims).toHaveLength(3);
    expect(parsed.errors.some((error) => error.includes("at most"))).toBe(true);
  });
});

describe("declareOutcomeToolResult", () => {
  it("summarises what was recorded and surfaces errors", () => {
    const result = declareOutcomeToolResult(
      { claims: [{ kind: "file-exists", path: "/x" }], errors: ["claim 2: invalid"] },
      4,
    );
    const text = result.content[0];
    expect(text?.type === "text" && text.text).toContain("Recorded 1 outcome");
    expect(text?.type === "text" && text.text).toContain("(4 total)");
    expect(text?.type === "text" && text.text).toContain("- claim 2: invalid");
    expect(result.details).toMatchObject({ declared: 1, total: 4 });
  });

  it("says so when nothing valid came through", () => {
    const result = declareOutcomeToolResult({ claims: [], errors: ['needs a "claims" array'] }, 0);
    const text = result.content[0];
    expect(text?.type === "text" && text.text).toContain("No valid outcomes");
  });
});

describe("DECLARE_OUTCOME_TOOL", () => {
  it("is a well-formed tool definition that is not yet a builtin", () => {
    expect(DECLARE_OUTCOME_TOOL.name).toBe("declare_outcome");
    expect(DECLARE_OUTCOME_TOOL.inputSchema.required).toEqual(["claims"]);
  });
});

describe("createSandboxOutcomeVerifier", () => {
  function sandbox(overrides: {
    listFiles?: (dir: string) => Promise<ComputerFileEntry[]>;
    observe?: () => Promise<ComputerObservation>;
  }) {
    return {
      listFiles: async (_c: ComputerRef, dir: string) =>
        overrides.listFiles ? overrides.listFiles(dir) : [],
      observe: async () =>
        overrides.observe
          ? overrides.observe()
          : ({
              frameId: "f",
              capturedAt: "2026-01-01T00:00:00.000Z",
              mimeType: "image/png",
              image: new Uint8Array(),
              width: 1,
              height: 1,
            } satisfies ComputerObservation),
    };
  }

  it("verifies file-exists from a directory listing without reading the file", async () => {
    let dirAsked = "";
    const verifier = createSandboxOutcomeVerifier(
      sandbox({
        listFiles: async (dir) => {
          dirAsked = dir;
          return [{ path: "/home/rakazo/out.csv", kind: "file", size: 2048 }];
        },
      }),
      COMPUTER,
      { now: () => "2026-09-06T12:00:00.000Z" },
    );

    const verdict = await verifier.verify(
      { kind: "file-exists", path: "/home/rakazo/out.csv" },
      context({ computer: COMPUTER }),
    );
    expect(verdict.status).toBe("verified");
    expect(verdict.evidence).toContain("2048 bytes");
    expect(dirAsked).toBe("/home/rakazo");
  });

  it("contradicts file-exists when the entry is absent or the dir is missing", async () => {
    const absent = createSandboxOutcomeVerifier(sandbox({ listFiles: async () => [] }), COMPUTER);
    expect(
      (await absent.verify({ kind: "file-exists", path: "/home/rakazo/x" }, context())).status,
    ).toBe("contradicted");

    const missingDir = createSandboxOutcomeVerifier(
      sandbox({
        listFiles: async () => {
          throw new Error("sandbox file read failed: 404 not found");
        },
      }),
      COMPUTER,
    );
    expect(
      (await missingDir.verify({ kind: "file-exists", path: "/nope/x" }, context())).status,
    ).toBe("contradicted");
  });

  it("stays unconfirmed when the sandbox errors for a non-missing reason", async () => {
    const verifier = createSandboxOutcomeVerifier(
      sandbox({
        listFiles: async () => {
          throw new Error("sandbox unreachable: 503");
        },
      }),
      COMPUTER,
    );
    expect(
      (await verifier.verify({ kind: "file-exists", path: "/home/rakazo/x" }, context())).status,
    ).toBe("unconfirmed");
  });

  it("matches text-on-screen against the active window title", async () => {
    const verifier = createSandboxOutcomeVerifier(
      sandbox({
        observe: async () => ({
          frameId: "f",
          capturedAt: "2026-01-01T00:00:00.000Z",
          mimeType: "image/png",
          image: new Uint8Array(),
          width: 1,
          height: 1,
          activeWindow: { id: "w1", title: "Report.pdf — Export complete" },
        }),
      }),
      COMPUTER,
    );
    const verdict = await verifier.verify(
      { kind: "text-on-screen", pattern: "Export complete" },
      context({ computer: COMPUTER }),
    );
    expect(verdict.status).toBe("verified");
  });
});

describe("finalizeRunOutcomes", () => {
  const context0 = context();

  it("returns null when the run declared nothing", async () => {
    const result = await finalizeRunOutcomes({
      runId: "run-1",
      claims: [],
      verifier: new FakeOutcomeVerifier(),
      context: context0,
    });
    expect(result).toBeNull();
  });

  it("verifies, rolls up, and packages an outcome.verified event", async () => {
    const fileClaim = { kind: "file-exists", path: "/home/rakazo/out.csv" } as const;
    const httpClaim = { kind: "http-ok", method: "GET", url: "https://api.test/health" } as const;
    const verifier = new FakeOutcomeVerifier({
      script: {
        [outcomeClaimKey(fileClaim)]: "verified",
        [outcomeClaimKey(httpClaim)]: { status: "contradicted", evidence: "HTTP 500" },
      },
      now: "2026-09-06T12:00:00.000Z",
    });

    const result = await finalizeRunOutcomes({
      runId: "run-9",
      claims: [fileClaim, httpClaim],
      verifier,
      context: context0,
    });

    expect(result?.event.type).toBe("outcome.verified");
    expect(result?.outcome).toMatchObject({ runId: "run-9", rolledUp: "contradicted" });
    expect(result?.event.payload).toBe(result?.outcome);
    expect(result?.summary).toContain("did not happen");
    expect(result?.summary).toContain("HTTP 500");
  });
});

describe("summarizeOutcome", () => {
  const base = (over: Partial<RunOutcome>): RunOutcome => ({
    runId: "r",
    verdicts: [],
    rolledUp: "unverified",
    ...over,
  });

  it("phrases each rollup", () => {
    expect(summarizeOutcome(base({}))).toContain("No outcomes were declared");
    expect(
      summarizeOutcome(
        base({
          rolledUp: "verified",
          verdicts: [
            {
              claim: { kind: "file-exists", path: "/x" },
              status: "verified",
              tier: "assertion",
              checkedAt: "2026-09-06T12:00:00.000Z",
              evidence: "/x is 3 bytes",
            },
          ],
        }),
      ),
    ).toMatch(/All declared outcomes verified — 1 verified/);
  });
});
