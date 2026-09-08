import { randomUUID } from "node:crypto";
import { ORPCError } from "@orpc/server";
import type {
  AgentHomeStore,
  BrowserDriver,
  BrowserSession,
  JobPublisher,
  SandboxProvider,
} from "@rakazo/adapter-kit";
import {
  type AdapterContext,
  runContinueJob,
  skillTeachingExpireJob,
  skillTeachingExpireJobKey,
} from "@rakazo/adapter-kit";
import {
  acquireComputerExecutionLease,
  appendRecordingEvent,
  captureTeachingSnapshot,
  completeTeachingSession,
  emptyRecording,
  expireTaughtSkillTeaching,
  extendActiveComputerControl,
  getActiveTeachingSession,
  mapTaughtSkill,
  observeStopSnapshot,
  parsePlaybook,
  parseRecording,
  provisionComputer,
  recordTeachingInputEvent,
  releaseComputerExecutionLease,
  releaseTeachingComputerControlForBot,
  scheduleComputerControlExpiry,
  screenLeaseIdForRun,
  type TeachComputerInput,
  teachingControlLeaseExpiresAt,
} from "@rakazo/adapters";
import type {
  Actor,
  BrowserTeachActionInput,
  BrowserTeachView,
  MessageBlock,
  TaughtSkill,
  TaughtSkillSurface,
} from "@rakazo/contracts";
import {
  ACTIVE_RUN_STATUSES,
  browserTeachEvent,
  buildPlaybookFromRecording,
  formatSkillRunPrompt,
  type SkillPlaybook,
  type TeachRecordingEvent,
  teachRecordingTtlMs,
} from "@rakazo/core";
import {
  confirmBrowserSignIn,
  forgetBrowserSignIn,
  IsolationError,
  type PrismaClient,
  readBrowserSignIns,
  type ThreadEvents,
} from "@rakazo/db";

type TaughtSkillRow = {
  id: string;
  workspaceId: string;
  botId: string;
  userId: string;
  name: string;
  goal: string;
  status: string;
  surface: string;
  playbook: unknown;
  recording: unknown;
  startedAt: Date | null;
  expiresAt: Date | null;
  stoppedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface TaughtSkillsDeps {
  prisma: PrismaClient;
  events: ThreadEvents;
  jobs: JobPublisher;
  sandbox: SandboxProvider;
  home: AgentHomeStore;
  dataDir: string;
  /** A real browser on the host for `surface: "browser"` teaching. Absent → browser skills off. */
  browser?: BrowserDriver;
}

/** Role + accessible name of the `[ref=<ref>]` element in a playwright-mcp a11y tree. */
export function refFacts(tree: string, ref?: string): { role?: string; name?: string } {
  if (!ref) return {};
  const line = tree.split("\n").find((row) => row.includes(`[ref=${ref}]`));
  if (!line) return {};
  const match = line.match(/-\s*([a-zA-Z]+)\s+"([^"]*)"/);
  return match ? { role: match[1], name: match[2] } : {};
}

export async function browserView(session: BrowserSession): Promise<BrowserTeachView> {
  const snap = await session.snapshot();
  let screenshot: string | null = null;
  try {
    const { png } = await session.screenshot();
    screenshot = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  } catch {
    screenshot = null;
  }
  return { url: snap.url, title: snap.title, tree: snap.tree, hash: snap.hash, screenshot };
}

function browserContext(actor: Actor, botId: string, signal?: AbortSignal): AdapterContext {
  return {
    operationId: `browser-teach:${randomUUID()}`,
    traceId: `browser-teach:${botId}`,
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    botId,
    signal: signal ?? new AbortController().signal,
  };
}

function computerContext(actor: Actor, botId: string, operationId: string): AdapterContext {
  return {
    operationId,
    traceId: operationId,
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    botId,
    signal: new AbortController().signal,
  };
}

function ownedSkillWhere(actor: Actor, skillId: string) {
  return { id: skillId, workspaceId: actor.workspaceId, userId: actor.userId };
}

async function getOwnedSkill(
  deps: TaughtSkillsDeps,
  actor: Actor,
  skillId: string,
): Promise<TaughtSkillRow> {
  const skill = await deps.prisma.taughtSkill.findFirst({ where: ownedSkillWhere(actor, skillId) });
  if (!skill) throw new IsolationError();
  return skill;
}

async function getOwnedBot(deps: TaughtSkillsDeps, actor: Actor, botId: string): Promise<void> {
  const bot = await deps.prisma.bot.findFirst({
    where: { id: botId, workspaceId: actor.workspaceId, userId: actor.userId },
    select: { id: true },
  });
  if (!bot) throw new IsolationError();
}

export async function assertTeachingSendAllowed(
  prisma: PrismaClient,
  workspaceId: string,
  botId: string,
): Promise<void> {
  const active = await getActiveTeachingSession(prisma, workspaceId, botId);
  if (active) {
    throw new ORPCError("CONFLICT", { message: "Stop teaching first" });
  }
}

async function cancelActiveRuns(
  deps: TaughtSkillsDeps,
  _actor: Actor,
  botId: string,
): Promise<void> {
  const activeRuns = await deps.prisma.run.findMany({
    where: { botId, status: { in: [...ACTIVE_RUN_STATUSES] } },
    select: { id: true },
  });
  await deps.prisma.run.updateMany({
    where: { botId, status: { in: [...ACTIVE_RUN_STATUSES] } },
    data: { status: "cancelled", completedAt: new Date() },
  });
  await deps.prisma.computerExecutionLease.deleteMany({ where: { botId } });
  await deps.prisma.computer.updateMany({
    where: { executionBotId: botId },
    data: { executionRunId: null, executionBotId: null, executionLeaseExpiresAt: null },
  });
  await deps.prisma.event.deleteMany({
    where: { type: "thread.progress", runId: { in: activeRuns.map((run) => run.id) } },
  });
}

async function ensureGraphicalComputer(
  deps: TaughtSkillsDeps,
  actor: Actor,
  bot: Awaited<ReturnType<ReturnType<typeof import("@rakazo/db").createRepos>["getBot"]>>,
) {
  if (bot.computer?.kind === "desktop") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Teaching needs a graphical sandbox computer, not a desktop host",
    });
  }
  if (!bot.computer) throw new IsolationError();
  if (bot.computer.state !== "running" || !bot.computer.providerRef) {
    const ctx = computerContext(actor, bot.id, "skills.start");
    const manualRunId = `teach:${randomUUID()}`;
    const lease = await acquireComputerExecutionLease(deps.prisma, {
      computerId: bot.computer.id,
      runId: manualRunId,
      botId: bot.id,
    });
    try {
      await provisionComputer(deps, bot.computer.id, {
        ...ctx,
        screenLeaseId: screenLeaseIdForRun(lease, manualRunId),
      });
    } finally {
      await releaseComputerExecutionLease(deps.prisma, lease);
    }
    bot = await deps.prisma.bot.findUniqueOrThrow({
      where: { id: bot.id },
      include: { thread: true, computer: true },
    });
  }
  if (!bot.computer?.providerRef || bot.computer.state !== "running") {
    throw new ORPCError("BAD_REQUEST", { message: "Computer must be running to teach" });
  }
  if (bot.computer.kind === "desktop") {
    throw new ORPCError("BAD_REQUEST", {
      message: "Teaching needs a graphical sandbox computer, not a desktop host",
    });
  }
  return bot;
}

async function grantTakeover(
  deps: TaughtSkillsDeps,
  actor: Actor,
  bot: Awaited<ReturnType<ReturnType<typeof import("@rakazo/db").createRepos>["getBot"]>>,
  until: Date,
): Promise<{ bot: typeof bot; leaseId: string }> {
  if (!bot.computer) throw new IsolationError();
  if (await extendActiveComputerControl(deps.prisma, deps.jobs, bot.computer, bot.id, until)) {
    const leaseId = bot.computer.controlLeaseId;
    if (!leaseId) throw new IsolationError();
    return { bot, leaseId };
  }
  const leaseId = randomUUID();
  const expiresAt = teachingControlLeaseExpiresAt(until);
  const granted = await deps.prisma.computer.updateMany({
    where: {
      id: bot.computer.id,
      state: "running",
      OR: [{ controlHolder: { not: "user" } }, { controlBotId: bot.id }],
    },
    data: {
      controlHolder: "user",
      controlLeaseId: leaseId,
      controlLeaseExpiresAt: expiresAt,
      controlBotId: bot.id,
      state: "running",
    },
  });
  if (granted.count !== 1) {
    throw new ORPCError("CONFLICT", { message: "Could not take control of the computer" });
  }
  await scheduleComputerControlExpiry(deps.jobs, bot.computer.id, leaseId, expiresAt);
  if (bot.thread) {
    await deps.events.append({
      workspaceId: actor.workspaceId,
      threadId: bot.thread.id,
      botId: bot.id,
      type: "computer.takeover.granted",
      payload: { holder: "user", reason: "teaching" },
    });
  }
  return { bot, leaseId };
}

async function updateSkillDraftMessage(
  deps: TaughtSkillsDeps,
  actor: Actor,
  skill: TaughtSkillRow,
  input: {
    name?: string;
    playbook?: SkillPlaybook;
    status?: "draft" | "saved";
  },
): Promise<void> {
  const bot = await deps.prisma.bot.findUnique({
    where: { id: skill.botId },
    include: { thread: true },
  });
  if (!bot?.thread) return;

  const messages = await deps.prisma.message.findMany({
    where: { threadId: bot.thread.id, role: "bot" },
    orderBy: { seq: "desc" },
    take: 100,
  });

  for (const message of messages) {
    const parsed = message.blocks as MessageBlock[];
    if (!Array.isArray(parsed)) continue;
    const index = parsed.findIndex(
      (block) => block.kind === "skill_draft" && block.skillId === skill.id,
    );
    if (index === -1) continue;
    const existing = parsed[index];
    if (existing?.kind !== "skill_draft") continue;
    const playbook = input.playbook ?? parsePlaybook(skill.playbook);
    const nextBlocks: MessageBlock[] = [...parsed];
    nextBlocks[index] = {
      kind: "skill_draft",
      skillId: skill.id,
      name: input.name ?? existing.name,
      goal: skill.goal,
      playbook,
      status: input.status ?? existing.status,
    };
    await deps.prisma.message.update({
      where: { id: message.id },
      data: { blocks: nextBlocks as never },
    });
    await deps.events.append({
      workspaceId: actor.workspaceId,
      threadId: bot.thread.id,
      botId: bot.id,
      type: "thread.message.updated",
      payload: { messageId: message.id, role: "bot", blocks: nextBlocks },
    });
    return;
  }
}

export async function expireTeachingSessionIfNeeded(deps: TaughtSkillsDeps, skillId: string) {
  return expireTaughtSkillTeaching(deps, skillId);
}

export async function stopTeachingSession(
  deps: TaughtSkillsDeps,
  actor: Actor,
  skillId: string,
): Promise<TaughtSkill> {
  await getOwnedSkill(deps, actor, skillId);
  await expireTeachingSessionIfNeeded(deps, skillId);
  const current = await deps.prisma.taughtSkill.findUniqueOrThrow({ where: { id: skillId } });
  if (current.status === "draft" || current.status === "saved") {
    await releaseTeachingComputerControlForBot(
      deps,
      actor,
      current.botId,
      parseRecording(current.recording).controlLeaseId,
    );
    return mapTaughtSkill(current);
  }
  if (current.status !== "recording" && current.status !== "drafting") {
    throw new ORPCError("BAD_REQUEST", { message: "Teaching session is not active" });
  }
  const bot = await deps.prisma.bot.findUnique({
    where: { id: current.botId },
    include: { thread: true, computer: true },
  });
  if (!bot) throw new IsolationError();
  const stopSnapshot =
    current.status === "recording" && bot.computer?.providerRef
      ? await observeStopSnapshot(deps, actor, bot)
      : undefined;
  const finalized = await completeTeachingSession(deps, actor, skillId, "stopped", stopSnapshot);
  await deps.jobs.cancel(skillTeachingExpireJobKey(current.id));
  return mapTaughtSkill(finalized);
}

export function createTaughtSkillsService(deps: TaughtSkillsDeps) {
  // Live browser teaching sessions, keyed by bot. Opened on start(surface:"browser"),
  // closed on stop / remove; an expired session is reaped by the driver's own idle timeout.
  const browserSessions = new Map<string, { session: BrowserSession; skillId: string }>();

  async function closeBrowserTeach(botId: string): Promise<void> {
    const entry = browserSessions.get(botId);
    if (!entry) return;
    browserSessions.delete(botId);
    await entry.session.close().catch(() => undefined);
  }

  async function openBrowserTeach(
    actor: Actor,
    botId: string,
    skillId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!deps.browser) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Browser skills aren't available on this deployment",
      });
    }
    await closeBrowserTeach(botId);
    const session = await deps.browser.open(botId, browserContext(actor, botId, signal));
    browserSessions.set(botId, { session, skillId });
  }

  async function requireActiveBrowserSession(actor: Actor, botId: string): Promise<BrowserSession> {
    const skill = await getActiveTeachingSession(
      deps.prisma,
      actor.workspaceId,
      botId,
      actor.userId,
    );
    if (skill?.surface !== "browser") {
      throw new ORPCError("CONFLICT", { message: "No active browser teaching session" });
    }
    if (skill.expiresAt && skill.expiresAt.getTime() <= Date.now()) {
      await expireTeachingSessionIfNeeded(deps, skill.id);
      await closeBrowserTeach(botId);
      throw new ORPCError("CONFLICT", { message: "The teaching session has expired" });
    }
    const entry = browserSessions.get(botId);
    if (!entry || entry.skillId !== skill.id) {
      throw new ORPCError("CONFLICT", { message: "No active browser teaching session" });
    }
    return entry.session;
  }

  return {
    async list(actor: Actor, botId: string): Promise<TaughtSkill[]> {
      const rows = await deps.prisma.taughtSkill.findMany({
        where: { workspaceId: actor.workspaceId, botId, userId: actor.userId },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(mapTaughtSkill);
    },

    async get(actor: Actor, skillId: string): Promise<TaughtSkill> {
      const row = await getOwnedSkill(deps, actor, skillId);
      await expireTeachingSessionIfNeeded(deps, row.id);
      const current = await deps.prisma.taughtSkill.findUniqueOrThrow({ where: { id: skillId } });
      return mapTaughtSkill(current);
    },

    async start(
      actor: Actor,
      botId: string,
      goal: string,
      surface: TaughtSkillSurface = "computer",
    ): Promise<TaughtSkill> {
      let bot = await deps.prisma.bot.findFirst({
        where: { id: botId, workspaceId: actor.workspaceId, userId: actor.userId },
        include: { thread: true, computer: true },
      });
      if (!bot) throw new IsolationError();
      const alreadyRecording = await deps.prisma.taughtSkill.findFirst({
        where: { botId, status: "recording" },
        select: { id: true },
      });
      if (alreadyRecording) {
        throw new ORPCError("CONFLICT", { message: "A teaching session is already active" });
      }
      await cancelActiveRuns(deps, actor, botId);

      if (surface === "browser") {
        if (!deps.browser) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Browser skills aren't available on this deployment",
          });
        }
        const startedAt = new Date();
        const expiresAt = new Date(startedAt.getTime() + teachRecordingTtlMs());
        let row: TaughtSkillRow;
        try {
          row = await deps.prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT id FROM bots WHERE id = ${botId} FOR UPDATE`;
            const existing = await tx.taughtSkill.findFirst({
              where: { botId, status: "recording" },
            });
            if (existing) {
              throw new ORPCError("CONFLICT", { message: "A teaching session is already active" });
            }
            return tx.taughtSkill.create({
              data: {
                workspaceId: actor.workspaceId,
                botId,
                userId: actor.userId,
                goal,
                surface,
                status: "recording",
                startedAt,
                expiresAt,
                recording: emptyRecording() as never,
                playbook: buildPlaybookFromRecording(goal, []) as never,
              },
            });
          });
        } catch (error) {
          if (error instanceof ORPCError) throw error;
          if (
            error instanceof Error &&
            "code" in error &&
            (error as { code?: string }).code === "P2002"
          ) {
            throw new ORPCError("CONFLICT", { message: "A teaching session is already active" });
          }
          throw error;
        }
        await openBrowserTeach(actor, botId, row.id);
        await deps.jobs.enqueue(skillTeachingExpireJob(row.id, expiresAt));
        if (bot.thread) {
          await deps.events.append({
            workspaceId: actor.workspaceId,
            threadId: bot.thread.id,
            botId: bot.id,
            type: "skill.teaching.started",
            payload: { skillId: row.id, goal },
          });
        }
        return mapTaughtSkill(row);
      }

      bot = await ensureGraphicalComputer(deps, actor, bot);
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + teachRecordingTtlMs());
      const { leaseId } = await grantTakeover(deps, actor, bot, expiresAt);
      let row: TaughtSkillRow;
      try {
        row = await deps.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT id FROM bots WHERE id = ${botId} FOR UPDATE`;
          const existing = await tx.taughtSkill.findFirst({
            where: { botId, status: "recording" },
          });
          if (existing) {
            throw new ORPCError("CONFLICT", { message: "A teaching session is already active" });
          }
          return tx.taughtSkill.create({
            data: {
              workspaceId: actor.workspaceId,
              botId,
              userId: actor.userId,
              goal,
              surface,
              status: "recording",
              startedAt,
              expiresAt,
              recording: { ...emptyRecording(), controlLeaseId: leaseId } as never,
              playbook: buildPlaybookFromRecording(goal, []) as never,
            },
          });
        });
      } catch (error) {
        if (error instanceof ORPCError) throw error;
        if (
          error instanceof Error &&
          "code" in error &&
          (error as { code?: string }).code === "P2002"
        ) {
          throw new ORPCError("CONFLICT", { message: "A teaching session is already active" });
        }
        throw error;
      }
      await deps.jobs.enqueue(skillTeachingExpireJob(row.id, expiresAt));
      const withSnapshot = await captureTeachingSnapshot(deps, actor, bot, row);
      if (bot.thread) {
        await deps.events.append({
          workspaceId: actor.workspaceId,
          threadId: bot.thread.id,
          botId: bot.id,
          type: "skill.teaching.started",
          payload: { skillId: row.id, goal },
        });
      }
      return mapTaughtSkill(withSnapshot);
    },

    async appendEvent(
      actor: Actor,
      skillId: string,
      event: TeachRecordingEvent,
    ): Promise<TaughtSkill> {
      await getOwnedSkill(deps, actor, skillId);
      await expireTeachingSessionIfNeeded(deps, skillId);
      const current = await deps.prisma.taughtSkill.findUniqueOrThrow({ where: { id: skillId } });
      if (current.status !== "recording") {
        throw new ORPCError("BAD_REQUEST", { message: "Teaching session is not recording" });
      }
      const updated = await appendRecordingEvent(deps, skillId, event, { requireRecording: true });
      if (updated.status !== "recording") {
        throw new ORPCError("BAD_REQUEST", { message: "Teaching session is not recording" });
      }
      return mapTaughtSkill(updated);
    },

    async snapshot(actor: Actor, skillId: string): Promise<TaughtSkill> {
      await getOwnedSkill(deps, actor, skillId);
      await expireTeachingSessionIfNeeded(deps, skillId);
      const current = await deps.prisma.taughtSkill.findUniqueOrThrow({ where: { id: skillId } });
      if (current.status !== "recording") {
        throw new ORPCError("BAD_REQUEST", { message: "Teaching session is not recording" });
      }
      const bot = await deps.prisma.bot.findUnique({
        where: { id: current.botId },
        include: { computer: true },
      });
      if (!bot) throw new IsolationError();
      const updated = await captureTeachingSnapshot(deps, actor, bot, current);
      return mapTaughtSkill(updated);
    },

    async stop(actor: Actor, skillId: string): Promise<TaughtSkill> {
      const result = await stopTeachingSession(deps, actor, skillId);
      await closeBrowserTeach(result.botId);
      return result;
    },

    /** Current view of the bot's browser, or null when no browser teaching is active. */
    async browserTeachView(actor: Actor, botId: string): Promise<BrowserTeachView | null> {
      const skill = await getActiveTeachingSession(
        deps.prisma,
        actor.workspaceId,
        botId,
        actor.userId,
      );
      if (skill?.surface !== "browser") return null;
      const entry = browserSessions.get(botId);
      if (!entry || entry.skillId !== skill.id) return null;
      return browserView(entry.session);
    },

    /** Drive the bot's browser one step during teaching and record it. */
    async browserTeachAction(
      actor: Actor,
      botId: string,
      action: BrowserTeachActionInput,
    ): Promise<BrowserTeachView> {
      const session = await requireActiveBrowserSession(actor, botId);
      const before = await session.snapshot();
      const { role, name } = refFacts(before.tree, action.ref);

      switch (action.kind) {
        case "navigate":
          if (!action.url) throw new ORPCError("BAD_REQUEST", { message: "navigate needs a url" });
          await session.navigate(action.url);
          break;
        case "click":
          if (!action.ref) throw new ORPCError("BAD_REQUEST", { message: "click needs a ref" });
          await session.click(action.ref);
          break;
        case "type":
          if (!action.ref) throw new ORPCError("BAD_REQUEST", { message: "type needs a ref" });
          await session.type(action.ref, action.text ?? "", { submit: action.submit });
          break;
        case "select":
          if (!action.ref || !action.values?.length) {
            throw new ORPCError("BAD_REQUEST", { message: "select needs a ref and values" });
          }
          await session.select(action.ref, action.values);
          break;
        case "checkpoint":
          break;
      }

      const after = await browserView(session);
      const event = browserTeachEvent(
        {
          kind: action.kind,
          ref: action.ref,
          text: action.text,
          url: action.url,
          values: action.values,
          submit: action.submit,
          expect: action.expect,
        },
        { role, name, url: after.url, hash: after.hash },
      );
      const skill = await getActiveTeachingSession(
        deps.prisma,
        actor.workspaceId,
        botId,
        actor.userId,
      );
      if (skill) {
        const updated = await appendRecordingEvent(deps, skill.id, event, {
          requireRecording: true,
        });
        if (updated.status !== "recording") {
          throw new ORPCError("BAD_REQUEST", { message: "Teaching session is not recording" });
        }
      }
      return after;
    },

    /** Origins the user has confirmed this bot's browser is signed into. */
    async browserSignIns(actor: Actor, botId: string) {
      await getOwnedBot(deps, actor, botId);
      return readBrowserSignIns(deps.prisma, botId);
    },

    async confirmBrowserSignIn(actor: Actor, botId: string, origin: string) {
      await getOwnedBot(deps, actor, botId);
      return confirmBrowserSignIn(deps.prisma, {
        workspaceId: actor.workspaceId,
        botId,
        userId: actor.userId,
        origin,
      });
    },

    async forgetBrowserSignIn(actor: Actor, botId: string, origin: string) {
      await getOwnedBot(deps, actor, botId);
      return forgetBrowserSignIn(deps.prisma, botId, origin);
    },

    async updateDraft(
      actor: Actor,
      skillId: string,
      input: { name?: string; playbook: SkillPlaybook },
    ): Promise<TaughtSkill> {
      const skill = await getOwnedSkill(deps, actor, skillId);
      if (skill.status !== "draft" && skill.status !== "saved") {
        throw new ORPCError("BAD_REQUEST", { message: "Skill is not editable yet" });
      }
      const row = await deps.prisma.taughtSkill.update({
        where: { id: skill.id },
        data: {
          name: input.name ?? skill.name,
          playbook: input.playbook as never,
          status: skill.status === "saved" ? "saved" : "draft",
        },
      });
      await updateSkillDraftMessage(deps, actor, row, {
        name: row.name,
        playbook: parsePlaybook(row.playbook),
        status: row.status === "saved" ? "saved" : "draft",
      });
      return mapTaughtSkill(row);
    },

    async save(actor: Actor, skillId: string, name?: string): Promise<TaughtSkill> {
      const skill = await getOwnedSkill(deps, actor, skillId);
      if (skill.status !== "draft" && skill.status !== "saved") {
        throw new ORPCError("BAD_REQUEST", { message: "Finish recording before saving" });
      }
      const row = await deps.prisma.taughtSkill.update({
        where: { id: skill.id },
        data: {
          status: "saved",
          name: name ?? (skill.name || skill.goal.slice(0, 80)),
        },
      });
      const bot = await deps.prisma.bot.findUnique({
        where: { id: row.botId },
        include: { thread: true },
      });
      await updateSkillDraftMessage(deps, actor, row, {
        name: row.name,
        playbook: parsePlaybook(row.playbook),
        status: "saved",
      });
      if (bot?.thread) {
        await deps.events.append({
          workspaceId: actor.workspaceId,
          threadId: bot.thread.id,
          botId: bot.id,
          type: "skill.saved",
          payload: { skillId: row.id, name: row.name },
        });
      }
      return mapTaughtSkill(row);
    },

    async testRun(actor: Actor, skillId: string, prompt?: string): Promise<{ runId: string }> {
      const skill = await getOwnedSkill(deps, actor, skillId);
      if (skill.status !== "saved" && skill.status !== "draft") {
        throw new ORPCError("BAD_REQUEST", { message: "Skill must be saved or drafted first" });
      }
      const bot = await deps.prisma.bot.findUnique({
        where: { id: skill.botId },
        include: { thread: true },
      });
      if (!bot?.thread) throw new IsolationError();
      const playbook = parsePlaybook(skill.playbook);
      const taskPrompt =
        prompt ?? formatSkillRunPrompt(skill.name || skill.goal.slice(0, 80), playbook, true);
      const task = await deps.prisma.task.create({
        data: {
          workspaceId: actor.workspaceId,
          botId: bot.id,
          threadId: bot.thread.id,
          userId: actor.userId,
          prompt: taskPrompt,
          status: "queued",
        },
      });
      const run = await deps.prisma.run.create({
        data: {
          workspaceId: actor.workspaceId,
          botId: bot.id,
          threadId: bot.thread.id,
          taskId: task.id,
          userId: actor.userId,
          status: "queued",
          trigger: "skill",
        },
      });
      await deps.jobs.enqueue(runContinueJob(run.id));
      return { runId: run.id };
    },

    async remove(actor: Actor, skillId: string): Promise<{ ok: true }> {
      const skill = await getOwnedSkill(deps, actor, skillId);
      if (skill.status === "recording") {
        await deps.jobs.cancel(skillTeachingExpireJobKey(skill.id));
        if (skill.surface === "browser") {
          await closeBrowserTeach(skill.botId);
        } else {
          await releaseTeachingComputerControlForBot(
            deps,
            actor,
            skill.botId,
            parseRecording(skill.recording).controlLeaseId,
          );
        }
      }
      await deps.prisma.taughtSkill.delete({ where: { id: skill.id } });
      return { ok: true as const };
    },

    expireTeachingSessionIfNeeded: (skillId: string) =>
      expireTeachingSessionIfNeeded(deps, skillId),

    async recordInput(
      actor: Actor,
      botId: string,
      mapped: TeachComputerInput,
    ): Promise<"recorded" | "idle" | "stale"> {
      return recordTeachingInputEvent(deps, actor, botId, mapped);
    },
  };
}
