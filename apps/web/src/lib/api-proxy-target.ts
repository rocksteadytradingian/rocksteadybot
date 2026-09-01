import { existsSync } from "node:fs";

const DOCKER_API = "http://api:3100";
const HOST_API = "http://127.0.0.1:3100";

export function resolveApiProxyTarget(
  env: NodeJS.Dict<string>,
  inDocker = existsSync("/.dockerenv"),
): string {
  const explicit = env.API_PROXY_TARGET?.trim();
  if (explicit) return explicit;
  return inDocker ? DOCKER_API : HOST_API;
}

export function previewAllowedHosts(host: string): string[] {
  const hosts = new Set(["localhost", "127.0.0.1", host.trim()]);
  hosts.delete("");
  return [...hosts];
}
