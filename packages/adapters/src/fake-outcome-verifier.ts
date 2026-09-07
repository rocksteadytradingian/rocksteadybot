import type {
  AdapterDescriptor,
  OutcomeClaim,
  OutcomeVerifier,
  OutcomeVerifierCapabilities,
  OutcomeVerifyContext,
  Verdict,
  VerdictTier,
} from "@rakazo/adapter-kit";

/** A scripted answer: a bare status, or a partial verdict to override tier/evidence too. */
export type ScriptedVerdict = Verdict["status"] | Partial<Omit<Verdict, "claim">>;

export interface FakeOutcomeVerifierOptions {
  /** Answers keyed by `outcomeClaimKey(claim)`. Anything unscripted uses `fallback`. */
  script?: Record<string, ScriptedVerdict>;
  /** Verdict for a claim with no scripted answer. Defaults to `unconfirmed`. */
  fallback?: ScriptedVerdict;
  /** Frozen clock for `checkedAt`, so conformance runs are byte-stable. */
  now?: string;
}

/** A stable key for a claim, so a test can script an answer without repeating every field. */
export function outcomeClaimKey(claim: OutcomeClaim): string {
  const entries = Object.entries(claim as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return JSON.stringify(entries);
}

const DEFAULT_NOW = "2026-01-01T00:00:00.000Z";
const TIERS: VerdictTier[] = ["assertion", "model"];

/**
 * Deterministic OutcomeVerifier for offline tests. It performs no real checks: it returns the
 * scripted verdict for a claim, models the one documented runtime behaviour (a `text-on-screen`
 * claim with no computer attached is `unconfirmed`), and records every call for assertions.
 */
export class FakeOutcomeVerifier implements OutcomeVerifier {
  readonly calls: Array<{ claim: OutcomeClaim; hadComputer: boolean }> = [];

  constructor(private readonly options: FakeOutcomeVerifierOptions = {}) {}

  describe(): AdapterDescriptor<OutcomeVerifierCapabilities> {
    return {
      id: "fake",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { tiers: TIERS },
    };
  }

  async verify(claim: OutcomeClaim, context: OutcomeVerifyContext): Promise<Verdict> {
    const hadComputer = Boolean(context.computer);
    this.calls.push({ claim, hadComputer });
    const checkedAt = this.options.now ?? DEFAULT_NOW;

    if (claim.kind === "text-on-screen" && !hadComputer) {
      return {
        claim,
        status: "unconfirmed",
        tier: "assertion",
        checkedAt,
        evidence: "no computer attached to check the screen",
      };
    }

    const scripted = this.options.script?.[outcomeClaimKey(claim)] ?? this.options.fallback;
    return materialize(claim, scripted ?? "unconfirmed", checkedAt);
  }
}

function materialize(claim: OutcomeClaim, scripted: ScriptedVerdict, checkedAt: string): Verdict {
  const partial = typeof scripted === "string" ? { status: scripted } : scripted;
  return {
    claim,
    status: partial.status ?? "unconfirmed",
    tier: partial.tier ?? "assertion",
    checkedAt: partial.checkedAt ?? checkedAt,
    evidence: partial.evidence ?? `scripted ${partial.status ?? "unconfirmed"}`,
  };
}
