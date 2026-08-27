import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "./client.js";
import { IsolationError } from "./scope.js";

export class WorkspaceError extends Error {
  constructor(
    message: string,
    readonly code: "last_workspace" | "forbidden" | "not_found" = "not_found",
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export type WorkspaceRecord = { id: string; name: string };

function newId(): string {
  return randomBytes(16).toString("hex");
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}

export async function listWorkspaces(
  prisma: PrismaClient,
  userId: string,
): Promise<WorkspaceRecord[]> {
  const memberships = await prisma.member.findMany({
    where: { userId },
    include: { organization: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((member) => ({
    id: member.organization.id,
    name: member.organization.name,
  }));
}

export async function setActiveWorkspace(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string; sessionId?: string | null },
): Promise<void> {
  const member = await prisma.member.findUnique({
    where: {
      organizationId_userId: { organizationId: input.workspaceId, userId: input.userId },
    },
  });
  if (!member) throw new IsolationError();
  await prisma.session.updateMany({
    where: input.sessionId
      ? { id: input.sessionId, userId: input.userId }
      : { userId: input.userId },
    data: { activeOrganizationId: input.workspaceId },
  });
}

export async function createWorkspace(
  prisma: PrismaClient,
  input: {
    userId: string;
    name: string;
    slug?: string;
    sourceWorkspaceId?: string;
  },
): Promise<WorkspaceRecord> {
  const name = input.name.trim();
  if (!name) throw new WorkspaceError("Workspace name is required");
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const orgId = newId();
    const slug = attempt === 0 && input.slug ? input.slug : `ws-${newId().slice(0, 16)}`;
    try {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.organization.create({
          data: {
            id: orgId,
            name,
            slug,
            createdAt: new Date(),
          },
        });
        await tx.member.create({
          data: {
            id: newId(),
            organizationId: orgId,
            userId: input.userId,
            role: "owner",
            createdAt: new Date(),
          },
        });
        await tx.memoryDocument.create({
          data: {
            workspaceId: orgId,
            userId: input.userId,
            scope: "user",
            path: "MEMORY.md",
            content: "# User memory\n\nAccount-wide preferences live here.\n",
          },
        });
        await tx.notificationPreference.create({
          data: {
            workspaceId: orgId,
            userId: input.userId,
          },
        });
        if (input.sourceWorkspaceId) {
          await copyScopedCredentials(tx, input.userId, input.sourceWorkspaceId, orgId);
        }
      });
      return { id: orgId, name };
    } catch (error) {
      lastError = error;
      if (!isUniqueViolation(error)) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not create workspace");
}

export async function renameWorkspace(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string; name: string },
): Promise<WorkspaceRecord> {
  const name = input.name.trim();
  if (!name) throw new WorkspaceError("Workspace name is required");
  await assertOwner(prisma, input.userId, input.workspaceId);
  const organization = await prisma.organization.update({
    where: { id: input.workspaceId },
    data: { name },
    select: { id: true, name: true },
  });
  return organization;
}

export async function deleteWorkspace(
  prisma: PrismaClient,
  input: { userId: string; workspaceId: string; currentWorkspaceId: string },
): Promise<WorkspaceRecord> {
  await assertOwner(prisma, input.userId, input.workspaceId);
  const workspaces = await listWorkspaces(prisma, input.userId);
  if (workspaces.length < 2) {
    throw new WorkspaceError("Keep at least one workspace", "last_workspace");
  }
  const fallback = workspaces.find((workspace) => workspace.id !== input.workspaceId);
  if (!fallback) throw new WorkspaceError("Keep at least one workspace", "last_workspace");
  const nextActiveId =
    input.currentWorkspaceId === input.workspaceId ? fallback.id : input.currentWorkspaceId;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.session.updateMany({
      where: { userId: input.userId, activeOrganizationId: input.workspaceId },
      data: { activeOrganizationId: nextActiveId },
    });
    await tx.userModelCredential.deleteMany({
      where: { userId: input.userId, workspaceId: input.workspaceId },
    });
    await tx.userVoiceCredential.deleteMany({
      where: { userId: input.userId, workspaceId: input.workspaceId },
    });
    await tx.secret.updateMany({
      where: { userId: input.userId, workspaceId: input.workspaceId, kind: "composio" },
      data: { workspaceId: fallback.id },
    });
    await tx.secret.deleteMany({
      where: { userId: input.userId, workspaceId: input.workspaceId },
    });
    await tx.organization.delete({ where: { id: input.workspaceId } });
  });
  return workspaces.find((workspace) => workspace.id === nextActiveId) ?? fallback;
}

async function assertOwner(prisma: PrismaClient, userId: string, workspaceId: string) {
  const member = await prisma.member.findUnique({
    where: { organizationId_userId: { organizationId: workspaceId, userId } },
  });
  if (!member) throw new IsolationError();
  if (member.role !== "owner") throw new WorkspaceError("Forbidden", "forbidden");
}

async function copyScopedCredentials(
  tx: Prisma.TransactionClient,
  userId: string,
  sourceWorkspaceId: string,
  targetWorkspaceId: string,
) {
  const [modelCreds, voiceCreds] = await Promise.all([
    tx.userModelCredential.findMany({
      where: { userId, workspaceId: sourceWorkspaceId },
    }),
    tx.userVoiceCredential.findMany({
      where: { userId, workspaceId: sourceWorkspaceId },
    }),
  ]);
  const secretIds = [
    ...new Set([
      ...modelCreds.map((row) => row.secretId),
      ...voiceCreds.map((row) => row.secretId),
    ]),
  ];
  if (secretIds.length === 0) return;
  const secrets = await tx.secret.findMany({
    where: { id: { in: secretIds }, userId, workspaceId: sourceWorkspaceId },
  });
  const secretIdByOld = new Map<string, string>();
  for (const secret of secrets) {
    const created = await tx.secret.create({
      data: {
        userId,
        workspaceId: targetWorkspaceId,
        kind: secret.kind,
        ciphertext: secret.ciphertext,
      },
    });
    secretIdByOld.set(secret.id, created.id);
  }
  for (const cred of modelCreds) {
    const secretId = secretIdByOld.get(cred.secretId);
    if (!secretId) continue;
    await tx.userModelCredential.create({
      data: {
        userId,
        workspaceId: targetWorkspaceId,
        provider: cred.provider,
        label: cred.label,
        secretId,
        isDefault: cred.isDefault,
        defaultModel: cred.defaultModel,
      },
    });
  }
  for (const cred of voiceCreds) {
    const secretId = secretIdByOld.get(cred.secretId);
    if (!secretId) continue;
    await tx.userVoiceCredential.create({
      data: {
        userId,
        workspaceId: targetWorkspaceId,
        provider: cred.provider,
        secretId,
        isDefault: cred.isDefault,
        voiceId: cred.voiceId,
      },
    });
  }
}
