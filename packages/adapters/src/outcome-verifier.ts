import type {
  AdapterDescriptor,
  OutcomeClaim,
  OutcomeVerifier,
  OutcomeVerifierCapabilities,
  OutcomeVerifyContext,
  Verdict,
  VerdictTier,
} from "@rakazo/adapter-kit";
import { combineSignals } from "./connector-safety.js";

/** Reads a file the run may have produced. Resolves `null` when the path does not exist. */
export type OutcomeFileReader = (
  path: string,
  context: OutcomeVerifyContext,
) => Promise<Uint8Array | null>;

/** One read of the run's screen for `text-on-screen`: whatever text the sandbox can name. */
export type OutcomeScreenReader = (
  context: OutcomeVerifyContext,
) => Promise<{ windowTitle?: string; text?: string } | null>;

export interface StandardOutcomeVerifierDeps {
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Enables the `file-exists` tier. Without it that claim resolves `unconfirmed`. */
  readFile?: OutcomeFileReader;
  /** Enables the `text-on-screen` tier. Without it that claim resolves `unconfirmed`. */
  readScreen?: OutcomeScreenReader;
  /** Frozen clock for deterministic tests. */
  now?: () => string;
  /** Per-request network timeout for `http-ok`. */
  httpTimeoutMs?: number;
}

const DEFAULT_HTTP_TIMEOUT_MS = 15_000;
/** Tiers this verifier can actually reach today; OCR and model tiers land with later units. */
const TIERS: VerdictTier[] = ["assertion"];
const EVIDENCE_MAX = 160;

/**
 * Performs the assertion-tier outcome checks that need no model and no connector call:
 * `http-ok` (a real GET), `file-exists` (via an injected reader), and `text-on-screen`
 * (against the sandbox's accessibility text only — absence there is `unconfirmed`, never
 * `contradicted`, because it is not proof the pixels lack the text). `connector-record` and
 * `model-judgement` resolve `unconfirmed` until their integrations exist.
 *
 * The caller owns URL allow-listing for `http-ok`, the same as for any tool-issued request.
 */
export class StandardOutcomeVerifier implements OutcomeVerifier {
  constructor(private readonly deps: StandardOutcomeVerifierDeps = {}) {}

  describe(): AdapterDescriptor<OutcomeVerifierCapabilities> {
    return {
      id: "standard",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { tiers: TIERS },
    };
  }

  async verify(claim: OutcomeClaim, context: OutcomeVerifyContext): Promise<Verdict> {
    switch (claim.kind) {
      case "http-ok":
        return this.verifyHttp(claim, context);
      case "file-exists":
        return this.verifyFile(claim, context);
      case "text-on-screen":
        return this.verifyScreen(claim, context);
      case "connector-record":
        return this.make(
          claim,
          "unconfirmed",
          "assertion",
          "connector-record checks are not wired up yet",
        );
      case "model-judgement":
        return this.make(
          claim,
          "unconfirmed",
          "model",
          "model-judgement checks are not wired up yet",
        );
    }
  }

  private make(
    claim: OutcomeClaim,
    status: Verdict["status"],
    tier: VerdictTier,
    evidence: string,
  ): Verdict {
    return {
      claim,
      status,
      tier,
      checkedAt: this.deps.now?.() ?? new Date().toISOString(),
      evidence: truncate(evidence, EVIDENCE_MAX),
    };
  }

  private async verifyHttp(
    claim: Extract<OutcomeClaim, { kind: "http-ok" }>,
    context: OutcomeVerifyContext,
  ): Promise<Verdict> {
    const fetchImpl = this.deps.fetch ?? fetch;
    const where = safeUrl(claim.url);
    let response: Response;
    try {
      response = await fetchImpl(claim.url, {
        method: "GET",
        redirect: "follow",
        signal: combineSignals(
          context.signal,
          AbortSignal.timeout(this.deps.httpTimeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS),
        ),
      });
    } catch (error) {
      return this.make(
        claim,
        "unconfirmed",
        "assertion",
        `could not reach ${where}: ${errText(error)}`,
      );
    }

    const statusOk = claim.status != null ? response.status === claim.status : response.ok;
    if (!statusOk) {
      const expected = claim.status != null ? `, expected ${claim.status}` : "";
      return this.make(
        claim,
        "contradicted",
        "assertion",
        `${where} returned HTTP ${response.status}${expected}`,
      );
    }
    if (!claim.jsonPath) {
      return this.make(claim, "verified", "assertion", `HTTP ${response.status}`);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return this.make(
        claim,
        "unconfirmed",
        "assertion",
        `HTTP ${response.status} but the body was not JSON`,
      );
    }
    const selected = selectPath(body, claim.jsonPath);
    if (selected === undefined) {
      return this.make(claim, "contradicted", "assertion", `no value at "${claim.jsonPath}"`);
    }
    const actual = stringifyLeaf(selected);
    if (claim.equals != null && actual !== claim.equals) {
      return this.make(
        claim,
        "contradicted",
        "assertion",
        `"${claim.jsonPath}" is ${truncate(actual, 40)}, expected ${truncate(claim.equals, 40)}`,
      );
    }
    return this.make(
      claim,
      "verified",
      "assertion",
      claim.equals != null
        ? `"${claim.jsonPath}" = ${truncate(actual, 40)}`
        : `HTTP ${response.status}, "${claim.jsonPath}" present`,
    );
  }

  private async verifyFile(
    claim: Extract<OutcomeClaim, { kind: "file-exists" }>,
    context: OutcomeVerifyContext,
  ): Promise<Verdict> {
    if (!this.deps.readFile) {
      return this.make(claim, "unconfirmed", "assertion", "no file reader configured for this run");
    }
    let bytes: Uint8Array | null;
    try {
      bytes = await this.deps.readFile(claim.path, context);
    } catch (error) {
      return this.make(
        claim,
        "unconfirmed",
        "assertion",
        `could not read ${claim.path}: ${errText(error)}`,
      );
    }
    if (bytes == null) {
      return this.make(claim, "contradicted", "assertion", `${claim.path} does not exist`);
    }
    if (claim.minBytes != null && bytes.length < claim.minBytes) {
      return this.make(
        claim,
        "contradicted",
        "assertion",
        `${claim.path} is ${bytes.length} bytes, expected at least ${claim.minBytes}`,
      );
    }
    return this.make(claim, "verified", "assertion", `${claim.path} is ${bytes.length} bytes`);
  }

  private async verifyScreen(
    claim: Extract<OutcomeClaim, { kind: "text-on-screen" }>,
    context: OutcomeVerifyContext,
  ): Promise<Verdict> {
    if (!this.deps.readScreen) {
      return this.make(
        claim,
        "unconfirmed",
        "assertion",
        "no screen reader configured; OCR not available",
      );
    }
    if (!context.computer) {
      return this.make(
        claim,
        "unconfirmed",
        "assertion",
        "no computer attached to check the screen",
      );
    }
    let screen: Awaited<ReturnType<OutcomeScreenReader>>;
    try {
      screen = await this.deps.readScreen(context);
    } catch (error) {
      return this.make(
        claim,
        "unconfirmed",
        "assertion",
        `could not read the screen: ${errText(error)}`,
      );
    }
    const haystack = [screen?.windowTitle, screen?.text].filter(Boolean).join("\n");
    if (!haystack) {
      return this.make(claim, "unconfirmed", "assertion", "the screen returned no readable text");
    }
    if (toMatcher(claim.pattern).test(haystack)) {
      return this.make(claim, "verified", "assertion", "matched in the on-screen text");
    }
    return this.make(
      claim,
      "unconfirmed",
      "assertion",
      `"${truncate(claim.pattern, 40)}" not in the accessibility text; pixel/OCR check unavailable`,
    );
  }
}

/** Verify a list of claims against any OutcomeVerifier. Pairs with `rollUpVerdicts` from contracts. */
export async function verifyOutcomes(
  verifier: OutcomeVerifier,
  claims: readonly OutcomeClaim[],
  context: OutcomeVerifyContext,
): Promise<Verdict[]> {
  return Promise.all(claims.map((claim) => verifier.verify(claim, context)));
}

/** `/foo/i` is treated as a regex; anything else as a literal substring. Invalid regex → literal. */
function toMatcher(pattern: string): RegExp {
  const delimited = pattern.match(/^\/(.+)\/([a-z]*)$/);
  if (delimited) {
    try {
      return new RegExp(delimited[1] as string, delimited[2]);
    } catch {
      // fall through to literal
    }
  }
  return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/** Walk a dot path (`a.b.0.c`) through parsed JSON. `undefined` on any miss. */
function selectPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
}

function stringifyLeaf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}

/** Origin + path only, so evidence never carries a query-string token. */
function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

function errText(error: unknown): string {
  return truncate(error instanceof Error ? error.message : String(error), 80);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
