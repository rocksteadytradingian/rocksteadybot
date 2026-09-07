import { ORPCError } from "@orpc/server";
import {
  type EncryptedSecretStore,
  loadUserComposioApiKey,
  normalizeComposioProjectKey,
  sanitizeComposioError,
  verifyComposioProjectKey,
} from "@rakazo/adapters";
import type { Actor, ComposioProjectKeyStatus } from "@rakazo/contracts";
import {
  COMPOSIO_SECRET_KIND,
  findComposioCredential,
  Prisma,
  type PrismaClient,
} from "@rakazo/db";
import { withSerializableRetry } from "./serializable-retry.js";

export { loadUserComposioApiKey };

export interface ComposioProjectKeyDeps {
  prisma: PrismaClient;
  secrets: EncryptedSecretStore;
  envApiKey?: string;
}

export function composioProjectKeyStatus(
  hasUserKey: boolean,
  envApiKey?: string,
): ComposioProjectKeyStatus {
  if (hasUserKey) return { configured: true, source: "user" };
  if (envApiKey) return { configured: true, source: "server" };
  return { configured: false, source: "none" };
}

export async function readComposioProjectKeyStatus(
  deps: ComposioProjectKeyDeps,
  userId: string,
): Promise<ComposioProjectKeyStatus> {
  const cred = await findComposioCredential(deps.prisma, userId);
  return composioProjectKeyStatus(Boolean(cred), deps.envApiKey);
}

export async function persistComposioProjectKey(
  deps: ComposioProjectKeyDeps,
  actor: Actor,
  apiKey: string,
): Promise<ComposioProjectKeyStatus> {
  const key = normalizeComposioProjectKey(apiKey);
  const verified = await verifyComposioProjectKey(key);
  if (!verified.ok) {
    throw new ORPCError("BAD_REQUEST", { message: sanitizeComposioError(verified.message) });
  }
  const stored = await deps.secrets.put(key, {
    operationId: "connections.setProjectKey",
    traceId: "connections.setProjectKey",
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    signal: new AbortController().signal,
  });
  await withSerializableRetry(() =>
    deps.prisma.$transaction(
      async (tx) => {
        const existing = await tx.userComposioCredential.findUnique({
          where: { userId: actor.userId },
        });
        const secret = await tx.secret.create({
          data: {
            id: stored.id,
            userId: actor.userId,
            workspaceId: actor.workspaceId,
            kind: COMPOSIO_SECRET_KIND,
            ciphertext: stored.ciphertext,
          },
        });
        if (!existing) {
          await tx.userComposioCredential.create({
            data: { userId: actor.userId, secretId: secret.id },
          });
          return;
        }
        await tx.userComposioCredential.update({
          where: { id: existing.id },
          data: { secretId: secret.id },
        });
        await tx.secret.deleteMany({ where: { id: existing.secretId, userId: actor.userId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
  return { configured: true, source: "user" };
}

export async function clearComposioProjectKey(
  deps: ComposioProjectKeyDeps,
  userId: string,
): Promise<ComposioProjectKeyStatus> {
  await withSerializableRetry(() =>
    deps.prisma.$transaction(
      async (tx) => {
        const existing = await tx.userComposioCredential.findUnique({ where: { userId } });
        if (!existing) return;
        await tx.userComposioCredential.delete({ where: { id: existing.id } });
        await tx.secret.deleteMany({ where: { id: existing.secretId, userId } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );
  return composioProjectKeyStatus(false, deps.envApiKey);
}
