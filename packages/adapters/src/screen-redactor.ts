import type {
  AdapterContext,
  AdapterDescriptor,
  RedactableFrame,
  RedactedFrame,
  RedactionPolicy,
  RedactionRegion,
  ScreenRedactor,
  ScreenRedactorCapabilities,
} from "@rakazo/adapter-kit";

/**
 * The default screen redactor: it never changes a frame or its text. Registered so the
 * observation seam always has a provider to call; a workspace only gets real redaction after
 * a policy selects a capable provider.
 */
export class NoopScreenRedactor implements ScreenRedactor {
  describe(): AdapterDescriptor<ScreenRedactorCapabilities> {
    return {
      id: "noop",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { image: false, text: false, ocr: false },
    };
  }

  async redactFrame(
    frame: RedactableFrame,
    _policy: RedactionPolicy,
    _context: AdapterContext,
  ): Promise<RedactedFrame> {
    return { image: frame.image, regions: [] };
  }

  async redactText(value: string, _policy: RedactionPolicy, _context: AdapterContext) {
    return value;
  }
}

export interface ScriptedScreenRedactorOptions {
  /** Regions a `redactFrame` call would find, before the policy filters them. */
  regions?: RedactionRegion[];
  /** Ordered substring/regex → replacement pairs applied by `redactText`. */
  textReplacements?: Array<[string | RegExp, string]>;
}

/**
 * Deterministic redactor for offline tests. It does not touch image bytes — it returns the
 * scripted regions (after applying the policy the same way a real provider must) and does
 * plain string replacement for text. Records every call.
 */
export class ScriptedScreenRedactor implements ScreenRedactor {
  readonly frameCalls: Array<{ policy: RedactionPolicy; applied: RedactionRegion[] }> = [];
  readonly textCalls: Array<{ value: string; policy: RedactionPolicy }> = [];

  constructor(private readonly options: ScriptedScreenRedactorOptions = {}) {}

  describe(): AdapterDescriptor<ScreenRedactorCapabilities> {
    return {
      id: "scripted",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { image: true, text: true, ocr: true },
    };
  }

  async redactFrame(
    frame: RedactableFrame,
    policy: RedactionPolicy,
    _context: AdapterContext,
  ): Promise<RedactedFrame> {
    const applied = applyPolicy(this.options.regions ?? [], policy);
    this.frameCalls.push({ policy, applied });
    return { image: frame.image, regions: applied };
  }

  async redactText(
    value: string,
    policy: RedactionPolicy,
    _context: AdapterContext,
  ): Promise<string> {
    this.textCalls.push({ value, policy });
    if (policy.mode === "off") return value;
    let out = value;
    for (const [pattern, replacement] of this.options.textReplacements ?? []) {
      out =
        typeof pattern === "string"
          ? out.replaceAll(pattern, replacement)
          : out.replace(pattern, replacement);
    }
    return out;
  }
}

/** The gate every redactor owes the policy: an `off` mode redacts nothing; then filter by
 *  selected entities and the confidence floor. */
export function applyPolicy(
  regions: readonly RedactionRegion[],
  policy: RedactionPolicy,
): RedactionRegion[] {
  if (policy.mode === "off") return [];
  const wanted = new Set(policy.entities);
  return regions.filter(
    (region) => wanted.has(region.entity) && region.score >= policy.minConfidence,
  );
}
