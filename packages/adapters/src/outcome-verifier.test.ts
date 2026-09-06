import type { ComputerRef, OutcomeClaim, OutcomeVerifyContext } from "@rakazo/adapter-kit";
import { rollUpVerdicts } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import {
  StandardOutcomeVerifier,
  type StandardOutcomeVerifierDeps,
  verifyOutcomes,
} from "./outcome-verifier.js";

const NOW = "2026-09-06T12:00:00.000Z";
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

function verifier(deps: StandardOutcomeVerifierDeps = {}) {
  return new StandardOutcomeVerifier({ now: () => NOW, ...deps });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("StandardOutcomeVerifier — describe", () => {
  it("advertises only the tier it can reach today", () => {
    expect(verifier().describe().capabilities.tiers).toEqual(["assertion"]);
  });
});

describe("http-ok", () => {
  const claim: OutcomeClaim = {
    kind: "http-ok",
    method: "GET",
    url: "https://api.test/health?token=secret",
  };

  it("verifies a 2xx and keeps the query string out of the evidence", async () => {
    const v = await verifier({ fetch: async () => new Response(null, { status: 204 }) }).verify(
      claim,
      context(),
    );
    expect(v).toMatchObject({ status: "verified", tier: "assertion", checkedAt: NOW });
    expect(v.evidence).not.toContain("secret");
  });

  it("contradicts a non-2xx", async () => {
    const v = await verifier({ fetch: async () => new Response("boom", { status: 500 }) }).verify(
      claim,
      context(),
    );
    expect(v.status).toBe("contradicted");
    expect(v.evidence).toContain("500");
  });

  it("honours an explicit expected status", async () => {
    const expect201: OutcomeClaim = { ...claim, status: 201 };
    const ok = await verifier({ fetch: async () => new Response(null, { status: 201 }) }).verify(
      expect201,
      context(),
    );
    expect(ok.status).toBe("verified");
    const bad = await verifier({ fetch: async () => new Response(null, { status: 200 }) }).verify(
      expect201,
      context(),
    );
    expect(bad.status).toBe("contradicted");
    expect(bad.evidence).toContain("expected 201");
  });

  it("is unconfirmed when the host is unreachable", async () => {
    const v = await verifier({
      fetch: async () => {
        throw new Error("ENOTFOUND");
      },
    }).verify(claim, context());
    expect(v.status).toBe("unconfirmed");
    expect(v.evidence).toMatch(/could not reach/i);
  });

  it("checks a dot-path value against equals", async () => {
    const deep: OutcomeClaim = {
      kind: "http-ok",
      method: "GET",
      url: "https://api.test/run",
      jsonPath: "result.items.0.state",
      equals: "done",
    };
    const pass = await verifier({
      fetch: async () => jsonResponse({ result: { items: [{ state: "done" }] } }),
    }).verify(deep, context());
    expect(pass.status).toBe("verified");

    const fail = await verifier({
      fetch: async () => jsonResponse({ result: { items: [{ state: "pending" }] } }),
    }).verify(deep, context());
    expect(fail.status).toBe("contradicted");
    expect(fail.evidence).toContain("pending");

    const missing = await verifier({
      fetch: async () => jsonResponse({ result: { items: [] } }),
    }).verify(deep, context());
    expect(missing.status).toBe("contradicted");
    expect(missing.evidence).toMatch(/no value at/i);
  });

  it("is unconfirmed when a jsonPath claim gets a non-JSON body", async () => {
    const withPath: OutcomeClaim = { ...claim, jsonPath: "ok" };
    const v = await verifier({ fetch: async () => new Response("<html>", { status: 200 }) }).verify(
      withPath,
      context(),
    );
    expect(v.status).toBe("unconfirmed");
    expect(v.evidence).toMatch(/not JSON/i);
  });
});

describe("file-exists", () => {
  const claim: OutcomeClaim = { kind: "file-exists", path: "/home/rakazo/out.csv" };

  it("verifies an existing file and reports its size", async () => {
    const v = await verifier({ readFile: async () => new Uint8Array(4242) }).verify(
      claim,
      context(),
    );
    expect(v.status).toBe("verified");
    expect(v.evidence).toContain("4242 bytes");
  });

  it("contradicts a missing file", async () => {
    const v = await verifier({ readFile: async () => null }).verify(claim, context());
    expect(v.status).toBe("contradicted");
    expect(v.evidence).toMatch(/does not exist/);
  });

  it("contradicts a file below minBytes", async () => {
    const v = await verifier({ readFile: async () => new Uint8Array(10) }).verify(
      { ...claim, minBytes: 100 },
      context(),
    );
    expect(v.status).toBe("contradicted");
    expect(v.evidence).toContain("expected at least 100");
  });

  it("is unconfirmed with no reader and when the reader throws", async () => {
    expect((await verifier().verify(claim, context())).status).toBe("unconfirmed");
    const threw = await verifier({
      readFile: async () => {
        throw new Error("EACCES");
      },
    }).verify(claim, context());
    expect(threw.status).toBe("unconfirmed");
  });
});

describe("text-on-screen", () => {
  const claim: OutcomeClaim = { kind: "text-on-screen", pattern: "Upload complete" };

  it("needs both a screen reader and a computer", async () => {
    expect((await verifier().verify(claim, context({ computer: COMPUTER }))).status).toBe(
      "unconfirmed",
    );
    const noComputer = await verifier({
      readScreen: async () => ({ text: "Upload complete" }),
    }).verify(claim, context());
    expect(noComputer.status).toBe("unconfirmed");
    expect(noComputer.evidence).toMatch(/no computer/i);
  });

  it("verifies a literal match in the window title or text", async () => {
    const v = await verifier({
      readScreen: async () => ({ windowTitle: "Files — Upload complete" }),
    }).verify(claim, context({ computer: COMPUTER }));
    expect(v.status).toBe("verified");
  });

  it("supports a /regex/ pattern", async () => {
    const rx: OutcomeClaim = { kind: "text-on-screen", pattern: "/uploaded \\d+ files/i" };
    const v = await verifier({ readScreen: async () => ({ text: "Uploaded 12 Files" }) }).verify(
      rx,
      context({ computer: COMPUTER }),
    );
    expect(v.status).toBe("verified");
  });

  it("is unconfirmed — not contradicted — when the text is absent from the a11y layer", async () => {
    const v = await verifier({ readScreen: async () => ({ text: "something else" }) }).verify(
      claim,
      context({ computer: COMPUTER }),
    );
    expect(v.status).toBe("unconfirmed");
    expect(v.evidence).toMatch(/pixel\/OCR check unavailable/i);
  });
});

describe("not-yet-wired claim kinds", () => {
  it("resolve unconfirmed with an honest reason", async () => {
    const connector = await verifier().verify(
      { kind: "connector-record", connector: "google-sheets", query: "row where A='Q3'" },
      context(),
    );
    expect(connector.status).toBe("unconfirmed");
    const model = await verifier().verify(
      { kind: "model-judgement", question: "Did it post?" },
      context(),
    );
    expect(model).toMatchObject({ status: "unconfirmed", tier: "model" });
  });
});

describe("verifyOutcomes + rollUpVerdicts", () => {
  it("rolls a mixed batch up to needs_review", async () => {
    const claims: OutcomeClaim[] = [
      { kind: "file-exists", path: "/home/rakazo/out.csv" },
      { kind: "http-ok", method: "GET", url: "https://api.test/health" },
    ];
    const verdicts = await verifyOutcomes(
      verifier({
        readFile: async () => new Uint8Array(8),
        fetch: async () => new Response(null, { status: 503 }),
      }),
      claims,
      context(),
    );
    expect(verdicts.map((verdict) => verdict.status)).toEqual(["verified", "contradicted"]);
    expect(rollUpVerdicts(verdicts)).toBe("contradicted");
  });

  it("rolls all-verified up to verified", async () => {
    const verdicts = await verifyOutcomes(
      verifier({
        readFile: async () => new Uint8Array(1),
        fetch: async () => new Response(null, { status: 200 }),
      }),
      [
        { kind: "file-exists", path: "/a" },
        { kind: "http-ok", method: "GET", url: "https://api.test/ok" },
      ],
      context(),
    );
    expect(rollUpVerdicts(verdicts)).toBe("verified");
  });
});
