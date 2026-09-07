import { REDACTION_OFF, REGULATED_REDACTION_POLICY } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { readWorkspaceRedactionPolicy, writeWorkspaceRedactionPolicy } from "./redaction-config.js";

function prismaWith(
  org: Partial<Record<"findUnique" | "update", ReturnType<typeof vi.fn>>>,
): PrismaClient {
  return { organization: org } as unknown as PrismaClient;
}

describe("readWorkspaceRedactionPolicy", () => {
  it("returns the stored policy", async () => {
    const findUnique = vi.fn().mockResolvedValue({ redactionPolicy: REGULATED_REDACTION_POLICY });
    await expect(readWorkspaceRedactionPolicy(prismaWith({ findUnique }), "ws")).resolves.toEqual(
      REGULATED_REDACTION_POLICY,
    );
  });

  it("falls back to off when unset, missing, or drifted", async () => {
    for (const value of [null, undefined, { mode: "vaporise" }, "nonsense"]) {
      const findUnique = vi
        .fn()
        .mockResolvedValue(value === undefined ? null : { redactionPolicy: value });
      await expect(readWorkspaceRedactionPolicy(prismaWith({ findUnique }), "ws")).resolves.toEqual(
        REDACTION_OFF,
      );
    }
  });
});

describe("writeWorkspaceRedactionPolicy", () => {
  it("updates the workspace row with the policy", async () => {
    const update = vi.fn().mockResolvedValue({});
    await writeWorkspaceRedactionPolicy(prismaWith({ update }), "ws", REGULATED_REDACTION_POLICY);
    expect(update).toHaveBeenCalledWith({
      where: { id: "ws" },
      data: { redactionPolicy: REGULATED_REDACTION_POLICY },
    });
  });
});
