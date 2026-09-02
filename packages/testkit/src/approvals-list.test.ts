import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PendingApproval } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sessionCookieHeader } from "./index.js";

type App = { request: (input: string, init?: RequestInit) => Promise<Response> };

process.env.WAKEUP_DRIVER = "memory";
process.env.SANDBOX_PROVIDER = "fake";
process.env.AGENT_RUNTIME = "scripted";

const hasDb = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
const describeApprovalsList = hasDb ? describe : describe.skip;

const allowDeny = [
  { id: "allow", label: "Allow once" },
  { id: "always", label: "Always allow this tool" },
  { id: "deny", label: "Deny" },
];

describeApprovalsList("approvals.list inbox", () => {
  let app: App;
  let prisma: PrismaClient;
  let stop: () => Promise<void>;
  const stamp = Date.now();
  const dataDir = mkdtempSync(path.join(tmpdir(), "rakazo-approvals-list-"));

  beforeAll(async () => {
    const { createApp } = await import("../../../apps/api/src/app.ts");
    const handles = await createApp({
      databaseUrl: process.env.DATABASE_URL!,
      dataDir,
      sandboxProvider: "fake",
      agentRuntime: "scripted",
    });
    app = handles.app;
    prisma = handles.prisma;
    stop = handles.stop;
  });

  afterAll(async () => {
    await stop?.();
  });

  it("lists pending action approvals and hides other workspaces", async () => {
    const cookie = await signup(app, `approvals-${stamp}@rakazo.test`, "Approvals User");
    const bot = await rpc<{ id: string }>(app, cookie, "bots/create", {
      name: "Chief",
      title: "Chief",
      description: "",
      instructions: "",
      notifyOnFinish: true,
    });
    await seedPendingApproval(
      prisma,
      bot.id,
      "effect-visible",
      'Review before writing "Q1" to crm',
    );

    const listed = await rpc<PendingApproval[]>(app, cookie, "approvals/list");
    expect(listed).toEqual([
      expect.objectContaining({
        botName: "Chief",
        summary: 'writing "Q1" to crm',
        toolName: "destination.write",
        highRisk: true,
      }),
    ]);

    const intruder = await signup(app, `approvals-intruder-${stamp}@rakazo.test`, "Intruder");
    expect(await rpc<PendingApproval[]>(app, intruder, "approvals/list")).toEqual([]);
  });

  it("omits answered cards and generic questions", async () => {
    const cookie = await signup(app, `approvals-skip-${stamp}@rakazo.test`, "Skip User");
    const bot = await rpc<{ id: string }>(app, cookie, "bots/create", {
      name: "Scout",
      title: "Scout",
      description: "",
      instructions: "",
      notifyOnFinish: true,
    });
    const run = await seedWaitingRun(prisma, bot.id, "which city?");
    await prisma.message.create({
      data: {
        threadId: run.threadId,
        seq: 99,
        role: "bot",
        runId: run.id,
        blocks: [{ kind: "ask", text: "Which city?", status: "pending" }],
      },
    });
    expect(await rpc<PendingApproval[]>(app, cookie, "approvals/list")).toEqual([]);
  });
});

async function seedPendingApproval(
  prisma: PrismaClient,
  botId: string,
  effectId: string,
  text: string,
) {
  const run = await seedWaitingRun(prisma, botId, "write this to crm");
  await prisma.externalEffect.create({
    data: {
      id: effectId,
      workspaceId: run.workspaceId,
      runId: run.id,
      kind: "destination.write",
      idempotencyKey: `${run.id}:destination.write:${effectId}`,
      status: "intended",
      request: { collection: "crm", title: "Q1" },
    },
  });
  await prisma.message.create({
    data: {
      threadId: run.threadId,
      seq: 99,
      role: "bot",
      runId: run.id,
      blocks: [
        {
          kind: "ask",
          approvalEffectId: effectId,
          text,
          status: "pending",
          actions: allowDeny,
        },
      ],
    },
  });
  return run;
}

async function seedWaitingRun(prisma: PrismaClient, botId: string, prompt: string) {
  const thread = await prisma.thread.findUniqueOrThrow({ where: { botId } });
  const task = await prisma.task.create({
    data: {
      workspaceId: thread.workspaceId,
      userId: thread.userId,
      botId,
      threadId: thread.id,
      prompt,
      status: "waiting_input",
    },
  });
  return prisma.run.create({
    data: {
      workspaceId: thread.workspaceId,
      userId: thread.userId,
      botId,
      threadId: thread.id,
      taskId: task.id,
      status: "waiting_input",
      trigger: "user",
    },
  });
}

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
    headers: {
      "content-type": "application/json",
      cookie,
      origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ json: body }),
  });
}
