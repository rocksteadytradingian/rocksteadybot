import type { RunOutcome, Verdict } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { readRunOutcome, writeRunOutcome } from "./run-outcomes.js";

const VERDICT: Verdict = {
  claim: { kind: "file-exists", path: "/home/rakazo/out.csv" },
  status: "verified",
  tier: "assertion",
  checkedAt: "2026-09-07T12:00:00.000Z",
  evidence: "/home/rakazo/out.csv is 2048 bytes",
};

const OUTCOME: RunOutcome = { runId: "run-1", verdicts: [VERDICT], rolledUp: "verified" };

function prismaWith(run: Partial<Record<"updateMany" | "findUnique", ReturnType<typeof vi.fn>>>) {
  return { run } as unknown as PrismaClient;
}

describe("writeRunOutcome", () => {
  it("writes the rollup and verdicts by run id", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await writeRunOutcome(prismaWith({ updateMany }), OUTCOME);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data: { outcomeStatus: "verified", outcomeVerdicts: [VERDICT] },
    });
  });
});

describe("readRunOutcome", () => {
  it("reconstructs a RunOutcome from stored JSON", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "run-1",
      outcomeStatus: "verified",
      outcomeVerdicts: [VERDICT],
    });
    await expect(readRunOutcome(prismaWith({ findUnique }), "run-1")).resolves.toEqual(OUTCOME);
  });

  it("returns null when the run declared nothing", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ id: "run-1", outcomeStatus: null, outcomeVerdicts: null });
    await expect(readRunOutcome(prismaWith({ findUnique }), "run-1")).resolves.toBeNull();
  });

  it("returns null when the run row is missing", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    await expect(readRunOutcome(prismaWith({ findUnique }), "gone")).resolves.toBeNull();
  });

  it("returns null when stored verdicts no longer match the contract", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "run-1",
      outcomeStatus: "verified",
      outcomeVerdicts: [{ status: "vibes" }],
    });
    await expect(readRunOutcome(prismaWith({ findUnique }), "run-1")).resolves.toBeNull();
  });
});
