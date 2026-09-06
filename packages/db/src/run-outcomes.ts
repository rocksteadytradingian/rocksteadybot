import { type RunOutcome, RunOutcomeSchema, VerdictSchema } from "@rakazo/contracts";
import type { Prisma, PrismaClient } from "./client.js";

const StoredVerdicts = VerdictSchema.array();

/**
 * Persist a finished run's outcome verdicts and their rollup onto the run row. Stored on
 * `Run` (not a side table) because there is exactly one per run and it is read alongside the
 * run's status. Uses `updateMany` so a lost race with run deletion is a no-op, not a throw.
 */
export async function writeRunOutcome(prisma: PrismaClient, outcome: RunOutcome): Promise<void> {
  await prisma.run.updateMany({
    where: { id: outcome.runId },
    data: {
      outcomeStatus: outcome.rolledUp,
      outcomeVerdicts: outcome.verdicts as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Read back a run's stored outcome. Returns null when the run declared nothing, has not
 * finished, or the stored JSON no longer parses against the current contract.
 */
export async function readRunOutcome(
  prisma: PrismaClient,
  runId: string,
): Promise<RunOutcome | null> {
  const row = await prisma.run.findUnique({
    where: { id: runId },
    select: { id: true, outcomeStatus: true, outcomeVerdicts: true },
  });
  if (!row || row.outcomeStatus == null || row.outcomeVerdicts == null) return null;

  const verdicts = StoredVerdicts.safeParse(row.outcomeVerdicts);
  if (!verdicts.success) return null;

  const parsed = RunOutcomeSchema.safeParse({
    runId: row.id,
    verdicts: verdicts.data,
    rolledUp: row.outcomeStatus,
  });
  return parsed.success ? parsed.data : null;
}
