import type {
  AgentToolExecutionResult,
  ComputerRef,
  ConnectorTool,
  OutcomeClaim,
  OutcomeVerifier,
  OutcomeVerifyContext,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import { OutcomeClaimSchema, type RunOutcome, rollUpVerdicts } from "@rakazo/contracts";
import { StandardOutcomeVerifier, verifyOutcomes } from "./outcome-verifier.js";

export const DECLARE_OUTCOME_TOOL_NAME = "declare_outcome";
/** Cap on declarations accumulated across a single run. */
export const MAX_DECLARED_OUTCOMES = 12;
/** `outcome.verified` is appended once per run that declared anything. */
export const OUTCOME_VERIFIED_EVENT = "outcome.verified" as const;

/**
 * Lets the agent state a checkable result it expects the task to have produced. The executor
 * accumulates declarations during the run, verifies each one independently once the run
 * finishes, writes the verdicts to the run row, and appends an `outcome.verified` event.
 * Registered in `builtinAgentTools`.
 */
export const DECLARE_OUTCOME_TOOL: ConnectorTool = {
  name: DECLARE_OUTCOME_TOOL_NAME,
  description:
    "Declare a concrete result this task should have produced. Each one is checked independently after you finish and the verdict is attached to the run, so declare only outcomes you can name precisely — a file at a path, a URL that should return OK, text that should be on screen — not vague goals. Safe to call more than once; declarations accumulate.",
  inputSchema: {
    type: "object",
    properties: {
      claims: {
        type: "array",
        description: "One or more checkable outcomes.",
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: [
                "file-exists",
                "text-on-screen",
                "http-ok",
                "connector-record",
                "model-judgement",
              ],
            },
            path: { type: "string", description: "file-exists: path in this bot's home." },
            minBytes: { type: "number", description: "file-exists: minimum size in bytes." },
            pattern: {
              type: "string",
              description: "text-on-screen: a substring, or /regex/ with optional flags.",
            },
            method: { type: "string", enum: ["GET"], description: "http-ok: always GET." },
            url: { type: "string", description: "http-ok: the URL to fetch." },
            status: {
              type: "number",
              description: "http-ok: expected status code; any 2xx when omitted.",
            },
            jsonPath: {
              type: "string",
              description: "http-ok: dot-path into the JSON body, e.g. result.items.0.state.",
            },
            equals: { type: "string", description: "http-ok: expected value at jsonPath." },
            connector: { type: "string", description: "connector-record: the connector id." },
            query: { type: "string", description: "connector-record: what to look for." },
            question: { type: "string", description: "model-judgement: a yes/no question." },
          },
          required: ["kind"],
        },
      },
    },
    required: ["claims"],
  },
};

export interface ParsedDeclaredOutcomes {
  claims: OutcomeClaim[];
  errors: string[];
}

/**
 * Validate one `declare_outcome` payload. `existingCount` is how many the run has already
 * accepted, so the {@link MAX_DECLARED_OUTCOMES} cap holds across repeated calls.
 */
export function parseDeclaredOutcomes(input: unknown, existingCount = 0): ParsedDeclaredOutcomes {
  const raw = (input as { claims?: unknown } | null | undefined)?.claims;
  if (!Array.isArray(raw)) {
    return { claims: [], errors: ['declare_outcome needs a "claims" array'] };
  }
  const claims: OutcomeClaim[] = [];
  const errors: string[] = [];
  for (const [index, entry] of raw.entries()) {
    if (existingCount + claims.length >= MAX_DECLARED_OUTCOMES) {
      errors.push(`claim ${index + 1} ignored: at most ${MAX_DECLARED_OUTCOMES} outcomes per run`);
      continue;
    }
    const parsed = OutcomeClaimSchema.safeParse(entry);
    if (parsed.success) claims.push(parsed.data);
    else errors.push(`claim ${index + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  }
  return { claims, errors };
}

/** Tool result for a `declare_outcome` call. `total` is the run's running count after this call. */
export function declareOutcomeToolResult(
  parsed: ParsedDeclaredOutcomes,
  total: number,
): AgentToolExecutionResult {
  const lines =
    parsed.claims.length > 0
      ? [
          `Recorded ${parsed.claims.length} outcome${parsed.claims.length === 1 ? "" : "s"} to verify after this run (${total} total).`,
        ]
      : ["No valid outcomes recorded."];
  for (const error of parsed.errors) lines.push(`- ${error}`);
  return {
    kind: "agent_tool_result",
    content: [{ type: "text", text: lines.join("\n") }],
    details: { declared: parsed.claims.length, total, errors: parsed.errors },
  };
}

/** True when a sandbox file error means "no such path" rather than a real failure. */
function isFileMissingError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return /not found|no such file|enoent|does not exist|(^|\D)404(\D|$)/.test(message);
}

/**
 * Bind a {@link StandardOutcomeVerifier} to a run's sandbox: `file-exists` stats via
 * `listFiles` on the parent directory (no file read), `text-on-screen` matches the active
 * window title from `observe`. Pass this the run's own computer and let `http-ok` use the
 * default global fetch.
 */
export function createSandboxOutcomeVerifier(
  sandbox: Pick<SandboxProvider, "listFiles" | "observe">,
  computer: ComputerRef,
  options: { now?: () => string; httpTimeoutMs?: number } = {},
): OutcomeVerifier {
  return new StandardOutcomeVerifier({
    now: options.now,
    httpTimeoutMs: options.httpTimeoutMs,
    statFile: async (path, context) => {
      const dir = parentDir(path);
      const base = baseName(path);
      let entries: Awaited<ReturnType<SandboxProvider["listFiles"]>>;
      try {
        entries = await sandbox.listFiles(computer, dir, context);
      } catch (error) {
        if (isFileMissingError(error)) return null;
        throw error;
      }
      const entry = entries.find((item) => item.path === path || baseName(item.path) === base);
      return entry && entry.kind === "file" ? { size: entry.size } : null;
    },
    readScreen: async (context) => {
      const observation = await sandbox.observe(computer, context);
      return { windowTitle: observation.activeWindow?.title };
    },
  });
}

export interface RunOutcomeResult {
  outcome: RunOutcome;
  /** One line for the run's final message and the notification body. */
  summary: string;
  event: { type: typeof OUTCOME_VERIFIED_EVENT; payload: RunOutcome };
}

/**
 * Verify every declared claim and package the result. Returns `null` when the run declared
 * nothing, so the caller keeps its existing "no outcomes" behaviour untouched.
 */
export async function finalizeRunOutcomes(args: {
  runId: string;
  claims: readonly OutcomeClaim[];
  verifier: OutcomeVerifier;
  context: OutcomeVerifyContext;
}): Promise<RunOutcomeResult | null> {
  if (args.claims.length === 0) return null;
  const verdicts = await verifyOutcomes(args.verifier, args.claims, args.context);
  const outcome: RunOutcome = { runId: args.runId, verdicts, rolledUp: rollUpVerdicts(verdicts) };
  return {
    outcome,
    summary: summarizeOutcome(outcome),
    event: { type: OUTCOME_VERIFIED_EVENT, payload: outcome },
  };
}

export function summarizeOutcome(outcome: RunOutcome): string {
  const counts = { verified: 0, unconfirmed: 0, contradicted: 0 };
  for (const verdict of outcome.verdicts) counts[verdict.status] += 1;

  const head =
    outcome.rolledUp === "verified"
      ? "All declared outcomes verified"
      : outcome.rolledUp === "contradicted"
        ? "A declared outcome did not happen"
        : outcome.rolledUp === "needs_review"
          ? "Some declared outcomes could not be confirmed"
          : "No outcomes were declared";

  const tally = [`${counts.verified} verified`];
  if (counts.unconfirmed > 0) tally.push(`${counts.unconfirmed} unconfirmed`);
  if (counts.contradicted > 0) tally.push(`${counts.contradicted} contradicted`);

  const worst =
    outcome.verdicts.find((verdict) => verdict.status === "contradicted") ??
    outcome.verdicts.find((verdict) => verdict.status === "unconfirmed");
  return `${head} — ${tally.join(", ")}${worst?.evidence ? `. ${worst.evidence}` : ""}`;
}

function parentDir(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const slash = trimmed.lastIndexOf("/");
  return slash <= 0 ? "" : trimmed.slice(0, slash);
}

function baseName(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1);
}
