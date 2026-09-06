import { REDACTION_OFF, type RedactionPolicy, RedactionPolicySchema } from "@rakazo/contracts";
import type { Prisma, PrismaClient } from "./client.js";

type OrganizationStore = Pick<PrismaClient, "organization">;

/**
 * The workspace's screen-scrubbing policy. Returns `REDACTION_OFF` when the workspace has
 * never set one, or when the stored value no longer parses against the current contract —
 * a drifted policy fails safe (off), never crashes an observation.
 */
export async function readWorkspaceRedactionPolicy(
  prisma: OrganizationStore,
  workspaceId: string,
): Promise<RedactionPolicy> {
  const row = await prisma.organization.findUnique({
    where: { id: workspaceId },
    select: { redactionPolicy: true },
  });
  const parsed = RedactionPolicySchema.safeParse(row?.redactionPolicy ?? undefined);
  return parsed.success ? parsed.data : REDACTION_OFF;
}

export async function writeWorkspaceRedactionPolicy(
  prisma: OrganizationStore,
  workspaceId: string,
  policy: RedactionPolicy,
): Promise<void> {
  await prisma.organization.update({
    where: { id: workspaceId },
    data: { redactionPolicy: policy as unknown as Prisma.InputJsonValue },
  });
}
