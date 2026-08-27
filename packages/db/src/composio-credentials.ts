import type { PrismaClient } from "./client.js";

export const COMPOSIO_SECRET_KIND = "composio";

export function findComposioCredential(prisma: PrismaClient, userId: string) {
  return prisma.userComposioCredential.findUnique({ where: { userId } });
}
