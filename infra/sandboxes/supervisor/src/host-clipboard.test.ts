import { describe, expect, it, vi } from "vitest";
import {
  applyHostPaste,
  attachHostClipboard,
  HOST_PASTE_TYPE_LIMIT,
  isHostPasteChord,
  keysymsForPasteText,
  sendLinuxPasteChord,
  unicodeKeysym,
  XK_CONTROL_L,
  XK_RETURN,
  XK_TAB,
  XK_V,
} from "../../computer/host-clipboard.js";

function pasteChord(overrides: Partial<KeyboardEvent> = {}) {
  return {
    key: "v",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides,
  };
}

describe("host clipboard into the computer session", () => {
  it("treats Ctrl/Cmd+V and Shift+Insert as host paste", () => {
    expect(isHostPasteChord(pasteChord())).toBe(true);
    expect(isHostPasteChord(pasteChord({ metaKey: true, ctrlKey: false }))).toBe(true);
    expect(isHostPasteChord(pasteChord({ key: "V" }))).toBe(true);
    expect(
      isHostPasteChord(
        pasteChord({ key: "Insert", shiftKey: true, ctrlKey: false, metaKey: false }),
      ),
    ).toBe(true);
  });

  it("ignores other chords so remote Ctrl+C / Ctrl+L keep working", () => {
    expect(isHostPasteChord(pasteChord({ key: "c" }))).toBe(false);
    expect(isHostPasteChord(pasteChord({ key: "l" }))).toBe(false);
    expect(isHostPasteChord(pasteChord({ altKey: true }))).toBe(false);
    expect(isHostPasteChord(pasteChord({ shiftKey: true }))).toBe(false);
    expect(isHostPasteChord(pasteChord({ repeat: true }))).toBe(false);
    expect(isHostPasteChord(pasteChord({ key: "Control", ctrlKey: true }))).toBe(false);
  });

  it("maps pasted text onto X11 keysyms, including Windows newlines", () => {
    expect(unicodeKeysym(0x41)).toBe(0x41);
    expect(unicodeKeysym(0x1f600)).toBe(0x01000000 + 0x1f600);
    expect(keysymsForPasteText("a\r\n\tb")).toEqual([
      { keysym: 0x61, code: null },
      { keysym: XK_RETURN, code: "Enter" },
      { keysym: XK_TAB, code: "Tab" },
      { keysym: 0x62, code: null },
    ]);
  });

  it("types host text into the focused remote widget after releasing modifiers", () => {
    const sent: Array<[number, string | null, boolean | undefined]> = [];
    const rfb = {
      clipboardPasteFrom: vi.fn(),
      sendKey: (keysym: number, code: string | null, down?: boolean) => {
        sent.push([keysym, code, down]);
      },
    };
    applyHostPaste(rfb, "Hi");
    expect(rfb.clipboardPasteFrom).toHaveBeenCalledWith("Hi");
    expect(sent[0]).toEqual([XK_CONTROL_L, "ControlLeft", false]);
    expect(sent.at(-4)).toEqual([0x48, null, true]);
    expect(sent.at(-3)).toEqual([0x48, null, false]);
    expect(sent.at(-2)).toEqual([0x69, null, true]);
    expect(sent.at(-1)).toEqual([0x69, null, false]);
    expect(sent.some(([keysym, , down]) => keysym === XK_V && down === true)).toBe(false);
  });

  it("falls back to a delayed Ctrl+V for huge pastes", () => {
    const delay = vi.fn();
    const rfb = {
      clipboardPasteFrom: vi.fn(),
      sendKey: vi.fn(),
    };
    applyHostPaste(rfb, "x".repeat(HOST_PASTE_TYPE_LIMIT + 1), { delayPasteChord: delay });
    expect(rfb.clipboardPasteFrom).toHaveBeenCalled();
    expect(delay).toHaveBeenCalledWith(expect.any(Function), 80);
    delay.mock.calls[0]?.[0]();
    expect(rfb.sendKey).toHaveBeenCalledWith(XK_CONTROL_L, "ControlLeft", true);
    expect(rfb.sendKey).toHaveBeenCalledWith(XK_V, "KeyV", true);
  });

  it("does not send a Linux paste chord until asked", () => {
    const rfb = { sendKey: vi.fn() };
    sendLinuxPasteChord(rfb);
    expect(rfb.sendKey.mock.calls).toEqual([
      [XK_CONTROL_L, "ControlLeft", true],
      [XK_V, "KeyV", true],
      [XK_V, "KeyV", false],
      [XK_CONTROL_L, "ControlLeft", false],
    ]);
  });

  it("stops noVNC from eating Ctrl+V so the browser paste event can fire", () => {
    vi.useFakeTimers();
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();
    const rfb = {
      viewOnly: false,
      clipboardPasteFrom: vi.fn(),
      sendKey: vi.fn(),
      focus: vi.fn(),
    };
    const target = new EventTarget();
    attachHostClipboard(rfb, target);

    target.dispatchEvent(
      Object.assign(new Event("keydown", { bubbles: true, cancelable: true }), {
        key: "v",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        repeat: false,
        stopPropagation,
        preventDefault,
      }),
    );
    expect(stopPropagation).toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();

    const paste = Object.assign(new Event("paste", { bubbles: true, cancelable: true }), {
      clipboardData: { getData: (type: string) => (type === "text/plain" ? "secret" : "") },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    target.dispatchEvent(paste);
    expect(paste.preventDefault).toHaveBeenCalled();
    expect(rfb.clipboardPasteFrom).toHaveBeenCalledWith("secret");
    expect(rfb.focus).toHaveBeenCalled();
    vi.runAllTimers();
    expect(rfb.clipboardPasteFrom).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("reads the host clipboard API when the browser does not fire a paste event", async () => {
    vi.useFakeTimers();
    const rfb = {
      viewOnly: false,
      clipboardPasteFrom: vi.fn(),
      sendKey: vi.fn(),
      focus: vi.fn(),
    };
    const target = new EventTarget();
    attachHostClipboard(rfb, target);
    const previous = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { readText: async () => "from-api" } },
    });
    try {
      target.dispatchEvent(
        Object.assign(new Event("keydown"), {
          key: "v",
          ctrlKey: true,
          metaKey: false,
          altKey: false,
          shiftKey: false,
          repeat: false,
        }),
      );
      await vi.runAllTimersAsync();
      expect(rfb.clipboardPasteFrom).toHaveBeenCalledWith("from-api");
    } finally {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: previous });
      vi.useRealTimers();
    }
  });
});
