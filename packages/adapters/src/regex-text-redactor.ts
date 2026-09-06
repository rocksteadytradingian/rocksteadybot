import type {
  AdapterContext,
  AdapterDescriptor,
  RedactableFrame,
  RedactedFrame,
  RedactionEntity,
  RedactionPolicy,
  ScreenRedactor,
  ScreenRedactorCapabilities,
} from "@rakazo/adapter-kit";

/** Entities this redactor can find in plain text. The rest (PERSON, MRN, …) need a real NER/PII service. */
export const REGEX_REDACTOR_ENTITIES: readonly RedactionEntity[] = [
  "EMAIL",
  "PHONE",
  "SSN",
  "CREDIT_CARD",
  "IP_ADDRESS",
];

const PATTERNS: Partial<Record<RedactionEntity, RegExp>> = {
  EMAIL: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  SSN: /\b\d{3}-\d{2}-\d{4}\b/g,
  IP_ADDRESS: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  // Requires a separator so it does not swallow every 10-digit run.
  PHONE: /(?:\+?1[-.\s])?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
  // 13–19 digits, optionally grouped by spaces or dashes; a Luhn check filters the noise.
  CREDIT_CARD: /\b(?:\d[ -]?){12,18}\d\b/g,
};

export interface EntitySpan {
  entity: RedactionEntity;
  /** Character offsets into the text that was scanned. */
  start: number;
  end: number;
  text: string;
}

/**
 * Every supported-entity match in `text`, honouring the policy's entity set, its allowlist,
 * and the CREDIT_CARD Luhn check. Ordered by position. Shared by the text redactor and the
 * OCR region detector so both find exactly the same things.
 */
export function findEntitySpans(text: string, policy: RedactionPolicy): EntitySpan[] {
  if (policy.mode === "off" || !text) return [];
  const allow = new Set(policy.allowlist ?? []);
  const spans: EntitySpan[] = [];
  for (const entity of policy.entities) {
    const pattern = PATTERNS[entity];
    if (!pattern) continue;
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const value = match[0];
      if (allow.has(value)) continue;
      if (entity === "CREDIT_CARD" && !luhnValid(value)) continue;
      spans.push({ entity, start: match.index, end: match.index + value.length, text: value });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** Passes the Luhn checksum used by real card numbers. */
export function luhnValid(digits: string): boolean {
  const clean = digits.replace(/\D/g, "");
  if (clean.length < 13 || clean.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = clean.length - 1; i >= 0; i -= 1) {
    let d = clean.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Deterministic, dependency-free redactor for the text that travels with a screenshot (window
 * titles now, accessibility text later). It has no image capability — pixel box-fill needs a
 * detector and is a separate provider. Matches are replaced with `[EMAIL]`, `[SSN]`, …;
 * anything in `policy.allowlist` is left as-is.
 */
export class RegexTextRedactor implements ScreenRedactor {
  describe(): AdapterDescriptor<ScreenRedactorCapabilities> {
    return {
      id: "regex-text",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { image: false, text: true, ocr: false },
    };
  }

  async redactFrame(
    frame: RedactableFrame,
    _policy: RedactionPolicy,
    _context: AdapterContext,
  ): Promise<RedactedFrame> {
    return { image: frame.image, regions: [] };
  }

  async redactText(
    value: string,
    policy: RedactionPolicy,
    _context: AdapterContext,
  ): Promise<string> {
    const spans = findEntitySpans(value, policy);
    if (spans.length === 0) return value;
    let out = "";
    let cursor = 0;
    for (const span of spans) {
      if (span.start < cursor) continue; // an earlier span already covered this text
      out += value.slice(cursor, span.start) + `[${span.entity}]`;
      cursor = span.end;
    }
    return out + value.slice(cursor);
  }
}
