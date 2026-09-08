import { describe, expect, it } from "vitest";
import { mapTaughtSkill, type TaughtSkillRow } from "./teaching-session.js";

function row(overrides: Partial<TaughtSkillRow> = {}): TaughtSkillRow {
  return {
    id: "skill_1",
    workspaceId: "ws_1",
    botId: "bot_1",
    userId: "user_1",
    name: "",
    goal: "Export the list",
    status: "saved",
    surface: "computer",
    playbook: {},
    recording: { events: [], snapshots: [] },
    startedAt: null,
    expiresAt: null,
    stoppedAt: null,
    createdAt: new Date("2026-09-08T00:00:00.000Z"),
    updatedAt: new Date("2026-09-08T00:00:00.000Z"),
    ...overrides,
  };
}

describe("mapTaughtSkill surface", () => {
  it("passes a browser surface through", () => {
    expect(mapTaughtSkill(row({ surface: "browser" })).surface).toBe("browser");
  });

  it("normalizes a missing or unknown surface to the bot computer", () => {
    expect(mapTaughtSkill(row({ surface: "" })).surface).toBe("computer");
    expect(mapTaughtSkill(row({ surface: "desktop" })).surface).toBe("computer");
  });
});
