import { describe, expect, it } from "vitest";
import { isComputerBusyForThread, liveStatusForBot } from "./live-bot-status";

describe("isComputerBusyForThread", () => {
  it("is true when this bot holds the computer", () => {
    expect(
      isComputerBusyForThread({
        controlHolder: "bot",
        busyBotName: "AdswizzBot",
        threadBotName: "AdswizzBot",
      }),
    ).toBe(true);
  });

  it("is true when a group member holds the computer", () => {
    expect(
      isComputerBusyForThread({
        controlHolder: "bot",
        busyBotName: "Writer",
        memberNames: ["Chief", "Writer"],
      }),
    ).toBe(true);
  });

  it("is false when another bot holds a shared computer", () => {
    expect(
      isComputerBusyForThread({
        controlHolder: "bot",
        busyBotName: "TritonBot",
        threadBotName: "AdswizzBot",
      }),
    ).toBe(false);
  });

  it("is false when the user has control", () => {
    expect(
      isComputerBusyForThread({
        controlHolder: "user",
        busyBotName: "AdswizzBot",
        threadBotName: "AdswizzBot",
      }),
    ).toBe(false);
  });
});

describe("liveStatusForBot", () => {
  it("prefers the live run status over a stale idle listing", () => {
    expect(
      liveStatusForBot({
        botId: "bot-1",
        botName: "AdswizzBot",
        listedStatus: "idle",
        runs: [{ botId: "bot-1", status: "running" }],
        activeBotId: "bot-1",
      }),
    ).toBe("running");
  });

  it("treats a matching computer lease as running when the snapshot lost the run", () => {
    expect(
      liveStatusForBot({
        botId: "bot-1",
        botName: "AdswizzBot",
        listedStatus: "idle",
        runs: [],
        activeBotId: "bot-1",
        busyBotName: "AdswizzBot",
        controlHolder: "bot",
      }),
    ).toBe("running");
  });

  it("keeps waiting_input so the avatar still animates while paused for the user", () => {
    expect(
      liveStatusForBot({
        botId: "bot-1",
        botName: "AdswizzBot",
        listedStatus: "idle",
        runs: [{ botId: "bot-1", status: "waiting_input" }],
        activeBotId: "bot-1",
      }),
    ).toBe("waiting_input");
  });
});
