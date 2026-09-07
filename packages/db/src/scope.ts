import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";

export class IsolationError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "IsolationError";
  }
}

export async function requireMembership(
  prisma: PrismaClient,
  userId: string,
  activeOrganizationId?: string | null,
): Promise<Actor> {
  const memberships = await prisma.member.findMany({
    where: { userId },
    include: { user: { select: { email: true } }, organization: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) {
    throw new IsolationError("No personal workspace");
  }
  const selected =
    (activeOrganizationId
      ? memberships.find((member) => member.organizationId === activeOrganizationId)
      : undefined) ??
    memberships.find((member) => member.organization.name === "Personal") ??
    memberships[0]!;
  const settings = await prisma.deploymentSettings.findUnique({
    where: { id: "default" },
  });
  return {
    userId: selected.userId,
    workspaceId: selected.organizationId,
    email: selected.user.email,
    isDeploymentOwner: settings?.ownerUserId === selected.userId,
  };
}

export function scoped<T extends { workspaceId: string; userId?: string }>(
  actor: Actor,
  record: T | null,
): T {
  if (!record || record.workspaceId !== actor.workspaceId) {
    throw new IsolationError();
  }
  if (record.userId && record.userId !== actor.userId) {
    throw new IsolationError();
  }
  return record;
}
