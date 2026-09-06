import type { RedactionPolicy } from "@rakazo/adapter-kit";
import { REDACTION_OFF } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { luhnValid, REGEX_REDACTOR_ENTITIES, RegexTextRedactor } from "./regex-text-redactor.js";

const ctx = {
  operationId: "op",
  traceId: "tr",
  workspaceId: "ws",
  userId: "u",
  signal: new AbortController().signal,
};

function policy(over: Partial<RedactionPolicy> = {}): RedactionPolicy {
  return {
    mode: "box-fill",
    entities: [...REGEX_REDACTOR_ENTITIES],
    minConfidence: 0.6,
    ...over,
  };
}

const redactor = new RegexTextRedactor();
const scrub = (value: string, p = policy()) => redactor.redactText(value, p, ctx);

describe("RegexTextRedactor", () => {
  it("describes itself as text-only", () => {
    expect(redactor.describe().capabilities).toEqual({ image: false, text: true, ocr: false });
  });

  it("does nothing to a frame", async () => {
    const image = new Uint8Array([1, 2, 3]);
    const out = await redactor.redactFrame(
      { image, mimeType: "image/png", width: 1, height: 1 },
      policy(),
      ctx,
    );
    expect(out).toEqual({ image, regions: [] });
  });

  it("returns the text unchanged when the policy is off", async () => {
    expect(await scrub("email me at a@b.com", REDACTION_OFF)).toBe("email me at a@b.com");
  });

  it("redacts each supported entity with a labelled placeholder", async () => {
    expect(await scrub("write alice@corp.com now")).toBe("write [EMAIL] now");
    expect(await scrub("ssn 123-45-6789 on file")).toBe("ssn [SSN] on file");
    expect(await scrub("call 415-555-2671 today")).toBe("call [PHONE] today");
    expect(await scrub("host 10.0.12.4 is up")).toBe("host [IP_ADDRESS] is up");
  });

  it("redacts a Luhn-valid card and leaves a random digit run alone", async () => {
    expect(await scrub("card 4111 1111 1111 1111 charged")).toBe("card [CREDIT_CARD] charged");
    expect(await scrub("order 1234 5678 9012 3456 shipped")).toBe(
      "order 1234 5678 9012 3456 shipped",
    );
  });

  it("only redacts the entities the policy selects", async () => {
    const emailOnly = policy({ entities: ["EMAIL"] });
    expect(await scrub("a@b.com and ssn 123-45-6789", emailOnly)).toBe(
      "[EMAIL] and ssn 123-45-6789",
    );
  });

  it("honours the allowlist", async () => {
    const p = policy({ entities: ["EMAIL"], allowlist: ["ops@rakazo.test"] });
    expect(await scrub("from ops@rakazo.test to jane@corp.com", p)).toBe(
      "from ops@rakazo.test to [EMAIL]",
    );
  });

  it("skips an unsupported entity without error", async () => {
    expect(await scrub("meet Jane Doe", policy({ entities: ["PERSON"] }))).toBe("meet Jane Doe");
  });
});

describe("luhnValid", () => {
  it("accepts known card numbers and rejects bad ones", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111 1111 1111 1111")).toBe(true);
    expect(luhnValid("1234567890123456")).toBe(false);
    expect(luhnValid("123")).toBe(false);
  });
});
