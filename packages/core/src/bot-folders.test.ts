import { describe, expect, it } from "vitest";
import {
  botFolderMounts,
  botFolderMountsEnabled,
  botFolderSpecHash,
  hostPathBasename,
} from "./bot-folders.js";

describe("botFolderMountsEnabled", () => {
  it("is off by default and on for common truthy values", () => {
    expect(botFolderMountsEnabled({})).toBe(false);
    expect(botFolderMountsEnabled({ RAKAZO_BOT_FOLDER_MOUNTS: "0" })).toBe(false);
    expect(botFolderMountsEnabled({ RAKAZO_BOT_FOLDER_MOUNTS: "1" })).toBe(true);
    expect(botFolderMountsEnabled({ RAKAZO_BOT_FOLDER_MOUNTS: "true" })).toBe(true);
  });
});

describe("hostPathBasename", () => {
  it("handles posix and windows paths and drive roots", () => {
    expect(hostPathBasename("/Users/me/Downloads/")).toBe("downloads");
    expect(hostPathBasename("C:\\Users\\me\\Reports")).toBe("reports");
    expect(hostPathBasename("C:\\")).toBe("c");
  });
});

describe("botFolderMounts", () => {
  it("maps each folder under /mnt/folders and de-collides shared basenames", () => {
    expect(botFolderMounts(["/Users/me/Downloads", "C:\\work\\reports", "/srv/reports"])).toEqual([
      { hostPath: "/Users/me/Downloads", containerPath: "/mnt/folders/downloads" },
      { hostPath: "C:\\work\\reports", containerPath: "/mnt/folders/reports" },
      { hostPath: "/srv/reports", containerPath: "/mnt/folders/reports-2" },
    ]);
  });

  it("skips blank entries", () => {
    expect(botFolderMounts(["  ", "/a/b"])).toEqual([
      { hostPath: "/a/b", containerPath: "/mnt/folders/b" },
    ]);
  });
});

describe("botFolderSpecHash", () => {
  it("is order-independent and stable, with a sentinel for the empty set", () => {
    expect(botFolderSpecHash([])).toBe("none");
    expect(botFolderSpecHash(["/a", "/b"])).toBe(botFolderSpecHash(["/b", "/a", "/a"]));
    expect(botFolderSpecHash(["/a"])).not.toBe(botFolderSpecHash(["/b"]));
  });
});
