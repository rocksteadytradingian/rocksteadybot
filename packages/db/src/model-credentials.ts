import { COMPLEXITY_ROUTER_MODEL_ID } from "@rakazo/contracts";
import { Prisma, type PrismaClient } from "./client.js";
import { withTransactionRetry } from "./transaction-retry.js";

export const newestModelCredentialOrder = [
  { updatedAt: "desc" as const },
  { createdAt: "desc" as const },
  { id: "desc" as const },
];

export function findDefaultModelCredential(
  prisma: PrismaClient,
  scope: { userId: string; workspaceId: string },
) {
  return prisma.userModelCredential.findFirst({
    where: { userId: scope.userId, workspaceId: scope.workspaceId, isDefault: true },
    orderBy: newestModelCredentialOrder,
  });
}

export function findModelCredential(
  prisma: PrismaClient,
  scope: { userId: string; workspaceId: string },
  provider: string,
) {
  return prisma.userModelCredential.findFirst({
    where: { userId: scope.userId, workspaceId: scope.workspaceId, provider },
    orderBy: newestModelCredentialOrder,
  });
}

export function findUserProviderModelCredentials(
  prisma: PrismaClient,
  scope: { userId: string; provider: string; secretId?: string },
) {
  return prisma.userModelCredential.findMany({
    where: {
      userId: scope.userId,
      provider: scope.provider,
      ...(scope.secretId ? { secretId: { not: scope.secretId } } : {}),
    },
    orderBy: newestModelCredentialOrder,
  });
}

/** Point every workspace's copy of this provider at one secret, then drop unused model secrets. */
export async function shareUserProviderSecret(
  tx: Prisma.TransactionClient,
  input: { userId: string; provider: string; secretId: string; baseUrl?: string | null },
): Promise<void> {
  await tx.userModelCredential.updateMany({
    where: {
      userId: input.userId,
      provider: input.provider,
      secretId: { not: input.secretId },
    },
    data: {
      secretId: input.secretId,
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
    },
  });
  const stillUsed = (
    await tx.userModelCredential.findMany({
      where: { userId: input.userId },
      select: { secretId: true },
    })
  ).map((row) => row.secretId);
  await tx.secret.deleteMany({
    where: {
      userId: input.userId,
      kind: "model",
      ...(stillUsed.length > 0 ? { id: { notIn: stillUsed } } : {}),
    },
  });
}

const SKIP_LAST_WORKING_PROVIDERS = new Set(["scripted"]);

export function isConcreteLastWorkingModelId(modelId: string | null | undefined): boolean {
  const id = modelId?.trim() ?? "";
  return id.length > 0 && id !== COMPLEXITY_ROUTER_MODEL_ID;
}

export function shouldRememberLastWorkingModel(input: {
  provider: string;
  modelId: string;
}): boolean {
  const provider = input.provider.trim();
  return (
    Boolean(provider) &&
    !SKIP_LAST_WORKING_PROVIDERS.has(provider) &&
    isConcreteLastWorkingModelId(input.modelId)
  );
}

export async function rememberLastWorkingModel(
  prisma: PrismaClient,
  scope: { userId: string; workspaceId: string },
  input: { provider: string; modelId: string },
): Promise<void> {
  if (!shouldRememberLastWorkingModel(input)) return;
  await prisma.member.updateMany({
    where: { userId: scope.userId, organizationId: scope.workspaceId },
    data: {
      lastWorkingModelProvider: input.provider.trim(),
      lastWorkingModelId: input.modelId.trim(),
    },
  });
}

async function applyLastWorkingModel(
  prisma: PrismaClient,
  scope: { userId: string; workspaceId: string },
  input: { provider: string; modelId: string },
): Promise<boolean> {
  const provider = input.provider.trim();
  const modelId = input.modelId.trim();
  if (!shouldRememberLastWorkingModel({ provider, modelId })) return false;
  const credential = await findModelCredential(prisma, scope, provider);
  if (!credential) return false;
  const current = await findDefaultModelCredential(prisma, scope);
  if (current?.id === credential.id && current.defaultModel === modelId && current.isDefault) {
    return false;
  }
  await withTransactionRetry(() =>
    prisma.$transaction(
      async (tx) => {
        await tx.userModelCredential.updateMany({
          where: { userId: scope.userId, workspaceId: scope.workspaceId },
          data: { isDefault: false },
        });
        await tx.userModelCredential.update({
          where: { id: credential.id },
          data: { defaultModel: modelId, isDefault: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
  return true;
}

/** Make the last model that completed a reply the workspace default. */
export async function restoreLastWorkingModel(
  prisma: PrismaClient,
  scope: { userId: string; workspaceId: string },
): Promise<boolean> {
  const member = await prisma.member.findUnique({
    where: {
      organizationId_userId: { organizationId: scope.workspaceId, userId: scope.userId },
    },
    select: { lastWorkingModelProvider: true, lastWorkingModelId: true },
  });
  let provider = member?.lastWorkingModelProvider?.trim() ?? "";
  let modelId = member?.lastWorkingModelId?.trim() ?? "";
  if (!shouldRememberLastWorkingModel({ provider, modelId })) {
    const fallback = await prisma.run.findFirst({
      where: {
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        status: "completed",
        modelProvider: { not: null },
        modelId: { not: null },
        bot: { modelProvider: null },
      },
      orderBy: { completedAt: "desc" },
      select: { modelProvider: true, modelId: true },
    });
    provider = fallback?.modelProvider?.trim() ?? "";
    modelId = fallback?.modelId?.trim() ?? "";
    if (!shouldRememberLastWorkingModel({ provider, modelId })) return false;
    await rememberLastWorkingModel(prisma, scope, { provider, modelId });
  }
  return applyLastWorkingModel(prisma, scope, { provider, modelId });
}
