import { COMPOSIO_SECRET_KIND, findComposioCredential, type PrismaClient } from "@rakazo/db";
import type { EncryptedSecretStore } from "./secrets.js";

export async function loadUserComposioApiKey(
  prisma: PrismaClient,
  secrets: EncryptedSecretStore,
  userId: string,
): Promise<string | undefined> {
  const cred = await findComposioCredential(prisma, userId);
  if (!cred) return undefined;
  const secret = await prisma.secret.findFirst({
    where: { id: cred.secretId, userId, kind: COMPOSIO_SECRET_KIND },
  });
  if (!secret) return undefined;
  return secrets.load(secret.ciphertext);
}
