/** Host OS clipboard → remote computer session (noVNC / x11vnc). */

export const XK_CONTROL_L = 0xffe3;
export const XK_CONTROL_R = 0xffe4;
export const XK_SHIFT_L = 0xffe1;
export const XK_SHIFT_R = 0xffe2;
export const XK_ALT_L = 0xffe9;
export const XK_ALT_R = 0xffea;
export const XK_META_L = 0xffe7;
export const XK_META_R = 0xffe8;
export const XK_SUPER_L = 0xffeb;
export const XK_SUPER_R = 0xffec;
export const XK_RETURN = 0xff0d;
export const XK_TAB = 0xff09;
export const XK_V = 0x0076;

export const HOST_PASTE_TYPE_LIMIT = 8_000;

const MODIFIER_RELEASE = [
  { keysym: XK_CONTROL_L, code: "ControlLeft" },
  { keysym: XK_CONTROL_R, code: "ControlRight" },
  { keysym: XK_SHIFT_L, code: "ShiftLeft" },
  { keysym: XK_SHIFT_R, code: "ShiftRight" },
  { keysym: XK_ALT_L, code: "AltLeft" },
  { keysym: XK_ALT_R, code: "AltRight" },
  { keysym: XK_META_L, code: "MetaLeft" },
  { keysym: XK_META_R, code: "MetaRight" },
  { keysym: XK_SUPER_L, code: "MetaLeft" },
  { keysym: XK_SUPER_R, code: "MetaRight" },
];

/**
 * @param {{ key: string, ctrlKey: boolean, metaKey: boolean, altKey: boolean, shiftKey: boolean, repeat?: boolean }} event
 */
export function isHostPasteChord(event) {
  if (event.repeat || event.altKey) return false;
  const key = event.key;
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && key.toLowerCase() === "v") {
    return true;
  }
  return event.shiftKey && !event.ctrlKey && !event.metaKey && key === "Insert";
}

/** @param {number} codePoint */
export function unicodeKeysym(codePoint) {
  return codePoint < 0x100 ? codePoint : 0x01000000 + codePoint;
}

/** @param {string} text */
export function keysymsForPasteText(text) {
  /** @type {Array<{ keysym: number, code: string | null }>} */
  const keys = [];
  for (const char of text) {
    if (char === "\r") continue;
    if (char === "\n") {
      keys.push({ keysym: XK_RETURN, code: "Enter" });
      continue;
    }
    if (char === "\t") {
      keys.push({ keysym: XK_TAB, code: "Tab" });
      continue;
    }
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;
    keys.push({ keysym: unicodeKeysym(codePoint), code: null });
  }
  return keys;
}

/**
 * @param {{ viewOnly?: boolean, clipboardPasteFrom?: (text: string) => void, sendKey: (keysym: number, code: string | null, down?: boolean) => void }} rfb
 */
export function releaseHeldModifiers(rfb) {
  for (const modifier of MODIFIER_RELEASE) {
    rfb.sendKey(modifier.keysym, modifier.code, false);
  }
}

/**
 * @param {{ viewOnly?: boolean, clipboardPasteFrom?: (text: string) => void, sendKey: (keysym: number, code: string | null, down?: boolean) => void }} rfb
 */
export function sendLinuxPasteChord(rfb) {
  rfb.sendKey(XK_CONTROL_L, "ControlLeft", true);
  rfb.sendKey(XK_V, "KeyV", true);
  rfb.sendKey(XK_V, "KeyV", false);
  rfb.sendKey(XK_CONTROL_L, "ControlLeft", false);
}

/**
 * Put host text on the remote clipboard and insert it at the focused widget.
 *
 * @param {{ viewOnly?: boolean, clipboardPasteFrom?: (text: string) => void, sendKey: (keysym: number, code: string | null, down?: boolean) => void }} rfb
 * @param {string} text
 * @param {{ delayPasteChord?: (fn: () => void, ms: number) => void }} [clock]
 */
export function applyHostPaste(rfb, text, clock) {
  if (!text || rfb.viewOnly) return;
  rfb.clipboardPasteFrom?.(text);
  releaseHeldModifiers(rfb);
  if (text.length > HOST_PASTE_TYPE_LIMIT) {
    const later = clock?.delayPasteChord ?? globalThis.setTimeout.bind(globalThis);
    later(() => sendLinuxPasteChord(rfb), 80);
    return;
  }
  for (const key of keysymsForPasteText(text)) {
    rfb.sendKey(key.keysym, key.code, true);
    rfb.sendKey(key.keysym, key.code, false);
  }
}

/**
 * Intercept Ctrl/Cmd+V (and Shift+Insert) before noVNC turns them into remote
 * keystrokes, then inject the host clipboard into the computer session.
 *
 * @param {{ viewOnly?: boolean, focus?: () => void, clipboardPasteFrom?: (text: string) => void, sendKey: (keysym: number, code: string | null, down?: boolean) => void, addEventListener?: (type: string, listener: (event: { detail?: { text?: string } }) => void) => void }} rfb
 * @param {Pick<EventTarget, "addEventListener" | "removeEventListener">} [target]
 */
export function attachHostClipboard(rfb, target = globalThis) {
  let pasteHandled = false;

  function onPasteChord(event) {
    if (rfb.viewOnly || !isHostPasteChord(event)) return;
    event.stopPropagation();
    if (event.type !== "keydown") return;
    pasteHandled = false;
    globalThis.setTimeout(() => {
      const clipboard = globalThis.navigator?.clipboard;
      if (pasteHandled || !clipboard?.readText) return;
      void clipboard
        .readText()
        .then((text) => {
          if (pasteHandled || !text) return;
          pasteHandled = true;
          applyHostPaste(rfb, text);
          rfb.focus?.();
        })
        .catch(() => undefined);
    }, 0);
  }

  function onPaste(event) {
    if (rfb.viewOnly) return;
    const clipboard = "clipboardData" in event ? event.clipboardData : null;
    const text = clipboard?.getData("text/plain") ?? "";
    if (!text) return;
    pasteHandled = true;
    event.preventDefault();
    event.stopPropagation();
    applyHostPaste(rfb, text);
    rfb.focus?.();
  }

  function onRemoteClipboard(event) {
    const text = event.detail?.text;
    const writeText = globalThis.navigator?.clipboard?.writeText;
    if (!text || !writeText) return;
    void writeText.call(globalThis.navigator.clipboard, text).catch(() => undefined);
  }

  target.addEventListener("keydown", onPasteChord, true);
  target.addEventListener("keyup", onPasteChord, true);
  target.addEventListener("paste", onPaste, true);
  rfb.addEventListener?.("clipboard", onRemoteClipboard);

  return () => {
    target.removeEventListener("keydown", onPasteChord, true);
    target.removeEventListener("keyup", onPasteChord, true);
    target.removeEventListener("paste", onPaste, true);
  };
}
