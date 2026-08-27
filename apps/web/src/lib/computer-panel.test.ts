import { describe, expect, it } from "vitest";
import {
  COMPUTER_PANEL_CHAT_RESERVE,
  computerSidePanelBodyClass,
  computerSidePanelClass,
} from "./computer-panel";

describe("computer panel layout", () => {
  it("keeps the closed panel out of the way", () => {
    expect(computerSidePanelClass(false, false)).toContain("w-0");
    expect(computerSidePanelClass(false, true)).toContain("w-0");
  });

  it("uses the compact 384px computer column by default", () => {
    const className = computerSidePanelClass(true, false);
    expect(className).toContain("md:w-[384px]");
    expect(className).toContain("max-w-[384px]");
    expect(computerSidePanelBodyClass(false)).toContain("md:w-[384px]");
  });

  it("enlarges the computer column while leaving room for chat", () => {
    const className = computerSidePanelClass(true, true);
    expect(className).toContain("md:w-[min(56rem,calc(100vw-43.5rem))]");
    expect(className).toContain(COMPUTER_PANEL_CHAT_RESERVE);
    expect(className).not.toContain("md:w-[384px]");
    expect(computerSidePanelBodyClass(true)).toContain("flex-col");
    expect(computerSidePanelBodyClass(true)).not.toContain("md:w-[384px]");
  });
});
