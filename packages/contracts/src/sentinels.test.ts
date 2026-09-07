import { describe, expect, it } from "vitest";
import { SentinelSpecSchema, StoredSentinelSchema } from "./sentinels.js";

const httpCheck = { kind: "http-ok" as const, url: "https://status.example.test/health" };

describe("SentinelSpecSchema", () => {
  it("accepts an http-ok becomes-true notify sentinel", () => {
    const parsed = SentinelSpecSchema.parse({
      name: "prod health",
      check: httpCheck,
      trigger: "becomes-true",
      onFire: { kind: "notify", message: "prod is back" },
    });
    expect(parsed.check.kind).toBe("http-ok");
  });

  it("requires a window for stays-true-for", () => {
    const base = {
      name: "held green",
      check: httpCheck,
      trigger: "stays-true-for" as const,
      onFire: { kind: "run" as const, prompt: "write the all-clear" },
    };
    expect(SentinelSpecSchema.safeParse(base).success).toBe(false);
    expect(SentinelSpecSchema.safeParse({ ...base, window: "15m" }).success).toBe(true);
  });

  it("rejects a malformed window", () => {
    expect(
      SentinelSpecSchema.safeParse({
        name: "x",
        check: httpCheck,
        trigger: "stays-true-for",
        window: "quarter hour",
        onFire: { kind: "notify", message: "y" },
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown check kind", () => {
    expect(
      SentinelSpecSchema.safeParse({
        name: "x",
        check: { kind: "ping", host: "example.test" },
        trigger: "changes",
        onFire: { kind: "notify", message: "y" },
      }).success,
    ).toBe(false);
  });
});

describe("StoredSentinelSchema", () => {
  it("carries a nullable state and lastCheckedAt", () => {
    const parsed = StoredSentinelSchema.parse({
      id: "sen-1",
      workspaceId: "ws-1",
      botId: "bot-1",
      name: "prod health",
      check: { kind: "text-on-screen", text: "All systems operational" },
      trigger: "becomes-true",
      windowMs: null,
      onFire: { kind: "notify", message: "prod is back" },
      active: true,
      state: null,
      lastCheckedAt: null,
      nextRunAt: null,
      createdAt: "2026-09-07T12:00:00.000Z",
    });
    expect(parsed.state).toBeNull();
  });
});
