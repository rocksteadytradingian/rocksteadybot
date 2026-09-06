import type { SentinelCheck } from "@rakazo/contracts";
import type { SentinelObservation } from "@rakazo/core";
import type { SentinelCheckRunner } from "./sentinel-wake.js";

/**
 * The real `runCheck` for a `sentinel.wakeup` job. Today it can sample an `http-ok` check
 * (a plain GET, no body); `text-on-screen` needs a live computer, which a standalone
 * wakeup does not have, so it is rejected at `sentinel_create` time and never reaches here.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export function createHttpSentinelCheckRunner(
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): SentinelCheckRunner {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (check: SentinelCheck): Promise<SentinelObservation> => {
    if (check.kind !== "http-ok") {
      throw new Error(`sentinel check "${check.kind}" is not supported yet`);
    }
    const res = await doFetch(check.url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Drain the body so the connection can be reused / closed promptly.
    await res.body?.cancel().catch(() => undefined);
    return { ok: res.ok, value: String(res.status) };
  };
}
