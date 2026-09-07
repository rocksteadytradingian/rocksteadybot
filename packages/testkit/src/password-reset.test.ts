import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ComposioEmulator } from "@rakazo/adapters";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type AppHandles = Awaited<ReturnType<typeof import("../../../apps/api/src/app.ts").createApp>>;

process.env.WAKEUP_DRIVER = "memory";
process.env.SANDBOX_PROVIDER = "fake";
process.env.AGENT_RUNTIME = "scripted";

const hasDb = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
const describeWithDatabase = hasDb ? describe : describe.skip;

describeWithDatabase("password reset", () => {
  let handles: AppHandles;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dataDir = mkdtempSync(path.join(tmpdir(), "rakazo-reset-"));
  const origin = "http://127.0.0.1:5173";
  let resetUrl = "";

  beforeAll(async () => {
    const { createApp } = await import("../../../apps/api/src/app.ts");
    handles = await createApp({
      databaseUrl: process.env.DATABASE_URL!,
      dataDir,
      sandboxProvider: "fake",
      agentRuntime: "scripted",
      wakeupDriver: "memory",
      signupsEnabled: "true",
      composio: new ComposioEmulator(),
      sendResetPassword: async ({ url }) => {
        resetUrl = url;
      },
    });
  });

  afterAll(async () => {
    await handles?.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("resets a credential password through the Better Auth token", async () => {
    const email = `reset-${stamp}@rakazo.test`;
    const signup = await handles.app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, password: "old-password-12", name: "Reset" }),
    });
    expect(signup.status).toBeLessThan(400);

    const requested = await handles.app.request("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, redirectTo: `${origin}/reset-password` }),
    });
    expect(requested.status).toBeLessThan(400);
    expect(resetUrl).toMatch(/\/reset-password\//);

    const callback = await handles.app.request(
      new URL(resetUrl).pathname + new URL(resetUrl).search,
      {
        headers: { origin },
        redirect: "manual",
      },
    );
    const location = callback.headers.get("location") ?? "";
    const token = new URL(location, origin).searchParams.get("token");
    expect(token).toBeTruthy();

    const reset = await handles.app.request("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ newPassword: "new-password-12", token }),
    });
    expect(reset.status).toBeLessThan(400);

    const oldSignIn = await handles.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, password: "old-password-12" }),
    });
    expect(oldSignIn.status).toBeGreaterThanOrEqual(400);

    const newSignIn = await handles.app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email, password: "new-password-12" }),
    });
    expect(newSignIn.status).toBeLessThan(400);
  });
});
