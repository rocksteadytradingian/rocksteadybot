/** Vite DNS-rebinding suffix for Cloudflare quick tunnels (`*.trycloudflare.com`). */
export const TRYCLOUDFLARE_HOST_SUFFIX = ".trycloudflare.com";

/**
 * Hostnames Vite preview/dev will accept in the `Host` header. `RAKAZO_HOST` is
 * the deployment hostname. Quick tunnels use a generated `*.trycloudflare.com`
 * name, which Cloudflare controls, so that suffix is always allowed. Extra
 * names can be passed as a comma-separated `RAKAZO_ALLOWED_HOSTS` list (leading
 * dots are suffixes, matching Vite).
 */
export function resolvePreviewAllowedHosts(source: Record<string, string | undefined>): string[] {
  const previewHost = source.RAKAZO_HOST?.trim() || "localhost";
  const extra = (source.RAKAZO_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([previewHost, TRYCLOUDFLARE_HOST_SUFFIX, ...extra])];
}
