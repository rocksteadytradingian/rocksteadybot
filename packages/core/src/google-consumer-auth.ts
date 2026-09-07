/** Google consumer UIs that must not be driven from a bot computer. Use OAuth plugins. */

export const GOOGLE_CONSUMER_AUTH_INSTRUCTION =
  "Never sign into Google or operate Gmail, YouTube Studio, Google Business, Calendar, Drive, Docs, or similar Google consumer sites from this computer. Use connected plugin tools (OAuth APIs) instead. If a Google login wall appears, stop and tell the user to connect the plugin; do not type passwords or use request_takeover for Google credentials.";

const BLOCKED_HOSTS = new Set([
  "accounts.google.com",
  "accounts.youtube.com",
  "admin.google.com",
  "ads.google.com",
  "business.google.com",
  "calendar.google.com",
  "chat.google.com",
  "contacts.google.com",
  "docs.google.com",
  "drive.google.com",
  "gmail.com",
  "keep.google.com",
  "mail.google.com",
  "meet.google.com",
  "myaccount.google.com",
  "photos.google.com",
  "sheets.google.com",
  "slides.google.com",
  "studio.youtube.com",
  "workspace.google.com",
]);

const YOUTUBE_AUTH_PATH = /^\/(signin|account|upload|create_channel|live_dashboard|studio)(\/|$)/i;

export type PluginInstructionRow = {
  displayName: string;
  connectorId: string;
  provider: string;
};

export function connectedPluginsInstruction(plugins: readonly PluginInstructionRow[]): string {
  if (plugins.length === 0) {
    return "No plugins are connected yet. For Gmail, YouTube, Calendar, Drive, or Google Business, ask the user to connect the matching plugin. Do not sign into Google in the computer browser.";
  }
  const list = plugins
    .map((row) => `${row.displayName} (${row.connectorId}:${row.provider})`)
    .join(", ");
  return `Connected plugins: ${list}. Use those plugin tools when the user asks about those apps. Never operate the same apps by driving their consumer websites in the computer browser.`;
}

export function googleConsumerAuthRefusal(target: string): string | null {
  const host = blockedGoogleConsumerAuthHost(target);
  if (!host) return null;
  return `Blocked: do not open ${host} in the computer browser. Google suspends accounts for automated browser access. Connect the matching plugin (Gmail, YouTube, Calendar, Drive, Google Business) and use those OAuth tools instead.`;
}

export function blockedGoogleConsumerAuthHost(target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed) return null;
  const parsed = parseHttpLikeUrl(trimmed);
  if (!parsed) return null;
  const host = normalizeHost(parsed.hostname);
  if (!host) return null;
  if (BLOCKED_HOSTS.has(host)) return host;
  if (isYouTubeHost(host) && YOUTUBE_AUTH_PATH.test(parsed.pathname)) return host;
  return null;
}

function parseHttpLikeUrl(value: string): URL | null {
  try {
    if (/^https?:\/\//i.test(value)) return new URL(value);
    if (value.includes("://")) return null;
    if (!value.includes(".") && !value.includes("/")) return null;
    return new URL(`https://${value}`);
  } catch {
    return null;
  }
}

function normalizeHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

function isYouTubeHost(host: string): boolean {
  return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
}
