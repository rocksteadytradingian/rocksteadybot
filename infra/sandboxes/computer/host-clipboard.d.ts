/** Type declarations for host-clipboard.js (host OS clipboard -> remote computer session). */

export const XK_CONTROL_L: number;
export const XK_CONTROL_R: number;
export const XK_SHIFT_L: number;
export const XK_SHIFT_R: number;
export const XK_ALT_L: number;
export const XK_ALT_R: number;
export const XK_META_L: number;
export const XK_META_R: number;
export const XK_SUPER_L: number;
export const XK_SUPER_R: number;
export const XK_RETURN: number;
export const XK_TAB: number;
export const XK_V: number;

export const HOST_PASTE_TYPE_LIMIT: number;

export interface HostPasteKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  type?: string;
}

export interface HostClipboardRfb {
  viewOnly?: boolean;
  focus?: () => void;
  clipboardPasteFrom?: (text: string) => void;
  sendKey: (keysym: number, code: string | null, down?: boolean) => void;
  addEventListener?: (
    type: string,
    listener: (event: { detail?: { text?: string } }) => void,
  ) => void;
}

export interface HostPasteClock {
  delayPasteChord?: (fn: () => void, ms: number) => void;
}

export function isHostPasteChord(event: HostPasteKeyEvent): boolean;
export function unicodeKeysym(codePoint: number): number;
export function keysymsForPasteText(text: string): Array<{ keysym: number; code: string | null }>;
export function releaseHeldModifiers(rfb: HostClipboardRfb): void;
export function sendLinuxPasteChord(rfb: HostClipboardRfb): void;
export function applyHostPaste(rfb: HostClipboardRfb, text: string, clock?: HostPasteClock): void;
export function attachHostClipboard(
  rfb: HostClipboardRfb,
  target?: Pick<EventTarget, "addEventListener" | "removeEventListener">,
): () => void;
