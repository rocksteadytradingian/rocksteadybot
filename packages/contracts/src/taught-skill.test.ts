import { describe, expect, it } from "vitest";
import {
  BrowserTeachActionInputSchema,
  TaughtSkillSchema,
  TaughtSkillSurfaceSchema,
  TeachRecordingEventSchema,
} from "./domain.js";

const baseSkill = {
  id: "skill_1",
  botId: "bot_1",
  name: "Export the CRM list",
  goal: "Export this week's list and drop it in the shared folder",
  status: "saved" as const,
  playbook: {
    whenToUse: "",
    inputs: [],
    steps: [],
    howToCheck: "",
    whatToReturn: "",
    approvalBoundaries: "",
    failureHandling: "",
  },
  recording: { events: [], snapshots: [] },
  startedAt: null,
  expiresAt: null,
  stoppedAt: null,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};

describe("TaughtSkillSurfaceSchema", () => {
  it("accepts the two surfaces", () => {
    expect(TaughtSkillSurfaceSchema.parse("computer")).toBe("computer");
    expect(TaughtSkillSurfaceSchema.parse("browser")).toBe("browser");
  });

  it("rejects anything else", () => {
    expect(TaughtSkillSurfaceSchema.safeParse("desktop").success).toBe(false);
  });
});

describe("TaughtSkillSchema.surface", () => {
  it("defaults to the bot computer when omitted", () => {
    const parsed = TaughtSkillSchema.parse(baseSkill);
    expect(parsed.surface).toBe("computer");
  });

  it("keeps an explicit browser surface", () => {
    const parsed = TaughtSkillSchema.parse({ ...baseSkill, surface: "browser" });
    expect(parsed.surface).toBe("browser");
  });
});

describe("browser teach events", () => {
  it("parses a kind:browser recording event", () => {
    const parsed = TeachRecordingEventSchema.parse({
      at: "2026-09-08T00:00:00.000Z",
      kind: "browser",
      action: "click",
      ref: "e4",
      role: "link",
      name: "Checkout",
      url: "https://shop.test/cart",
      hash: "deadbeef",
    });
    expect(parsed.action).toBe("click");
  });

  it("rejects an unknown browser action on the action input", () => {
    expect(BrowserTeachActionInputSchema.safeParse({ kind: "click", ref: "e1" }).success).toBe(
      true,
    );
    expect(BrowserTeachActionInputSchema.safeParse({ kind: "scroll" }).success).toBe(false);
  });
});
