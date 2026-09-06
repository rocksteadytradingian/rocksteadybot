import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setWhisperEngine } from "@rakazo/adapters";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessionCookieHeader } from "./index.js";

type App = { request: (input: string, init?: RequestInit) => Promise<Response> };

process.env.WAKEUP_DRIVER = "memory";
process.env.SANDBOX_PROVIDER = "fake";
process.env.AGENT_RUNTIME = "scripted";

const hasDb = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
const describeDictation = hasDb ? describe : describe.skip;

describeDictation("on-device dictation fallback", () => {
  let app: App;
  let stop: () => Promise<void>;
  const stamp = Date.now();
  const dataDir = mkdtempSync(path.join(tmpdir(), "rakazo-dictation-"));

  beforeAll(async () => {
    setWhisperEngine(async () => ({ text: "typed on device" }));
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
    setWhisperEngine(undefined);
    await stop?.();
  });

  it("transcribes with no connected voice provider, and status reports it", async () => {
    const cookie = await signup(app, `dictation-${stamp}@rakazo.test`, "Dictation User");

    const status = await rpc<{ transcribe: boolean; localDictation?: boolean }>(
      app,
      cookie,
      "voice/status",
    );
    expect(status.localDictation).toBe(true);
    expect(status.transcribe).toBe(true);

    const res = await app.request("/api/voice/transcribe", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: "http://127.0.0.1:5173" },
      body: JSON.stringify({
        audioBase64: Buffer.from("noise").toString("base64"),
        mimeType: "audio/webm",
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "typed on device" });
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
  const res = await app.request(`/rpc/${proc}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: "http://127.0.0.1:5173" },
    body: JSON.stringify({ json: body }),
  });
  const parsed = JSON.parse(await res.text()) as { json?: T; error?: { message?: string } };
  if (res.status >= 400 || parsed.error) {
    throw new Error(`${proc} ${res.status}: ${parsed.error?.message ?? "error"}`);
  }
  return parsed.json as T;
}
