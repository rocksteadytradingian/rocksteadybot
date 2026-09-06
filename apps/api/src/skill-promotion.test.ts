import type { Actor } from "@rakazo/contracts";
import { parseSkillMd } from "@rakazo/core";
import { describe, expect, it, vi } from "vitest";
import { createSkillPromotionService } from "./skill-promotion.js";

const actor = { workspaceId: "ws-1", userId: "user-1" } as Actor;

function prisma(runs: Array<{ id: string }>, events: Array<{ runId: string; payload: unknown }>) {
  const runFindMany = vi.fn(async () => runs);
  const eventFindMany = vi.fn(async () => events);
  return {
    client: { run: { findMany: runFindMany }, event: { findMany: eventFindMany } } as never,
    runFindMany,
    eventFindMany,
  };
}

function toolEvents(runId: string, names: string[]) {
  return names.map((name) => ({ runId, payload: { name } }));
}

describe("createSkillPromotionService", () => {
  it("returns nothing without at least two recent runs", async () => {
    const p = prisma([{ id: "r1" }], toolEvents("r1", ["a", "b", "c"]));
    const svc = createSkillPromotionService(p.client);
    expect(await svc.suggestions(actor, { botId: "bot-1" })).toEqual([]);
    expect(p.eventFindMany).not.toHaveBeenCalled();
  });

  it("suggests a sequence two runs share, with a valid SKILL.md draft", async () => {
    const p = prisma(
      [{ id: "r1" }, { id: "r2" }],
      [
        ...toolEvents("r1", ["open_url", "read_page", "fill_form", "click", "screenshot"]),
        ...toolEvents("r2", ["note", "open_url", "read_page", "fill_form", "click"]),
      ],
    );
    const svc = createSkillPromotionService(p.client);
    const [suggestion, ...rest] = await svc.suggestions(actor, { botId: "bot-1" });
    expect(rest).toHaveLength(0);
    expect(suggestion?.tools).toEqual(["open_url", "read_page", "fill_form", "click"]);
    expect(suggestion?.runCount).toBe(2);
    expect(suggestion?.hash).toMatch(/^[0-9a-f]{16}$/);
    const parsed = parseSkillMd(suggestion?.draft ?? "");
    expect("error" in parsed).toBe(false);
  });

  it("collapses an immediate repeat before looking for a pattern", async () => {
    const p = prisma(
      [{ id: "r1" }, { id: "r2" }],
      [
        ...toolEvents("r1", ["login", "search", "search", "search", "export", "done"]),
        ...toolEvents("r2", ["login", "search", "export"]),
      ],
    );
    const svc = createSkillPromotionService(p.client);
    const [suggestion] = await svc.suggestions(actor, { botId: "bot-1" });
    expect(suggestion?.tools).toEqual(["login", "search", "export"]);
  });

  it("scopes the run query to the workspace, user, and bot", async () => {
    const p = prisma([], []);
    await createSkillPromotionService(p.client).suggestions(actor, { botId: "bot-9" });
    expect(p.runFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-1",
          userId: "user-1",
          botId: "bot-9",
          status: "completed",
        }),
      }),
    );
  });
});
