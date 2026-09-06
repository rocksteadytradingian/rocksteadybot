import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { RedactionPolicy } from "@rakazo/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessionCookieHeader } from "./index.js";

type App = { request: (input: string, init?: RequestInit) => Promise<Response> };

process.env.WAKEUP_DRIVER = "memory";
process.env.SANDBOX_PROVIDER = "fake";
process.env.AGENT_RUNTIME = "scripted";

const hasDb = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
const describeRedaction = hasDb ? describe : describe.skip;

describeRedaction("redaction policy RPC", () => {
  let app: App;
  let stop: () => Promise<void>;
  const stamp = Date.now();
  const dataDir = mkdtempSync(path.join(tmpdir(), "rakazo-redaction-"));

  beforeAll(async () => {
    const { createApp } = await import("../../../apps/api/src/app.ts");
    const handles = await createApp({
      databaseUrl: process.env.DATABASE_URL!,
      dataDir,
      sandboxProvider: "fake",
      agentRuntime: "scripted",
    });
    app = handles.app;
    stop = handles.stop;
  });

  afterAll(async () => {
    await stop?.();
  });

  it("defaults to off, round-trips a policy for the owner, and blocks a non-owner", async () => {
    const owner = await signup(app, `redact-owner-${stamp}@rakazo.test`, "Redaction Owner");

    const initial = await rpc<RedactionPolicy>(app, owner, "redaction/get");
    expect(initial.mode).toBe("off");

    const policy: RedactionPolicy = {
      mode: "box-fill",
      entities: ["EMAIL", "SSN"],
      minConfidence: 0.7,
      allowlist: ["ops@rakazo.test"],
    };
    const saved = await rpc<RedactionPolicy>(app, owner, "redaction/set", policy);
    expect(saved).toEqual(policy);
    expect(await rpc<RedactionPolicy>(app, owner, "redaction/get")).toEqual(policy);

    // A second signup is not the deployment owner.
    const other = await signup(app, `redact-other-${stamp}@rakazo.test`, "Other User");
    const denied = await raw(app, other, "redaction/set", { ...policy, mode: "off" });
    expect(denied.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a malformed policy", async () => {
    const owner = await signup(app, `redact-bad-${stamp}@rakazo.test`, "Bad Policy");
    const bad = await raw(app, owner, "redaction/set", {
      mode: "box-fill",
      entities: ["FACE"],
      minConfidence: 0.6,
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });
});

async function signup(app: App, email: string, name: string) {
  const response = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173" },
    body: JSON.stringify({ email, password: "test-password-123", name }),
  });
  expect(response.status).toBeLessThan(400);
  return sessionCookieHeader(response);
}

async function rpc<T>(app: App, cookie: string, proc: string, body: unknown = {}): Promise<T> {
  const res = await raw(app, cookie, proc, body);
  const text = await res.text();
  const parsed = JSON.parse(text) as { json?: T; error?: { message?: string } };
  if (res.status >= 400 || parsed.error) {
    throw new Error(`${proc} ${res.status}: ${parsed.error?.message ?? text}`);
  }
  return parsed.json as T;
}

async function raw(app: App, cookie: string, proc: string, body: unknown) {
  return app.request(`/rpc/${proc}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: "http://127.0.0.1:5173" },
    body: JSON.stringify({ json: body }),
  });
}
