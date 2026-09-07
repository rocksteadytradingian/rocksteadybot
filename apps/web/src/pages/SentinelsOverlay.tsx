import { Trans, useLingui } from "@lingui/react/macro";
import type { StoredSentinel } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

const TRIGGER_LABEL: Record<StoredSentinel["trigger"], string> = {
  "becomes-true": "when it first passes",
  changes: "when the status changes",
  "stays-true-for": "once it has held",
};

function formatWindow(ms: number | null): string {
  if (!ms) return "";
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  return `${Math.round(ms / 1000)}s`;
}

export function SentinelsOverlay({ botId, onClose }: { botId: string; onClose: () => void }) {
  const { t } = useLingui();
  const [sentinels, setSentinels] = useState<StoredSentinel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    rpc.sentinels
      .list({ botId })
      .then(setSentinels)
      .catch((err) => setError(err instanceof Error ? err.message : t`Could not load sentinels`));
  }, [botId, t]);

  useEffect(() => {
    let cancelled = false;
    rpc.sentinels
      .list({ botId })
      .then((next) => {
        if (!cancelled) setSentinels(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t`Could not load sentinels`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [botId, t]);

  async function cancel(sentinelId: string) {
    setBusyId(sentinelId);
    setError(null);
    try {
      await rpc.sentinels.cancel({ sentinelId });
      setSentinels((current) => current?.filter((s) => s.id !== sentinelId) ?? current);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not cancel the sentinel`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--rk-overlay)] p-4 sm:p-10">
      <div className="flex max-h-[min(760px,100%)] w-[600px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-panel)] shadow-[var(--rk-shadow)]">
        <div className="flex items-start justify-between px-6 pt-6 sm:px-8 sm:pt-7">
          <div>
            <div className="text-2xl font-medium text-[var(--rk-ink)]">
              <Trans>Sentinels</Trans>
            </div>
            <div className="mt-1 text-[13.5px] text-[var(--rk-muted)]">
              <Trans>
                URL watchers this bot set up. They act only when a check's state changes. Ask the
                bot to create one.
              </Trans>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t`Close`}
            className="rounded-[10px] px-2 py-1 text-[var(--rk-muted)] hover:bg-[var(--rk-hover)] hover:text-[var(--rk-ink)]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8">
          {error ? <div className="mb-4 text-[13px] text-[var(--rk-danger)]">{error}</div> : null}
          {sentinels === null ? (
            <div className="text-[13.5px] text-[var(--rk-muted-2)]">
              <Trans>Loading…</Trans>
            </div>
          ) : sentinels.length === 0 ? (
            <div className="text-[13.5px] text-[var(--rk-muted-2)]">
              <Trans>No sentinels yet.</Trans>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sentinels.map((sentinel) => (
                <div
                  key={sentinel.id}
                  className="rounded-[14px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-medium text-[var(--rk-ink)]">
                        {sentinel.name}
                        {!sentinel.active ? (
                          <span className="ml-2 text-[11.5px] text-[var(--rk-muted)]">
                            <Trans>paused</Trans>
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 truncate font-mono text-[11.5px] text-[var(--rk-muted)]">
                        {sentinel.check.kind === "http-ok"
                          ? `GET ${sentinel.check.url}`
                          : `screen: "${sentinel.check.text}"`}
                      </div>
                      <div className="mt-1 text-[12px] text-[var(--rk-body)]">
                        {TRIGGER_LABEL[sentinel.trigger]}
                        {sentinel.trigger === "stays-true-for" && sentinel.windowMs
                          ? ` ${formatWindow(sentinel.windowMs)}`
                          : ""}
                        {" → "}
                        {sentinel.onFire.kind === "notify" ? (
                          <Trans>post a message</Trans>
                        ) : (
                          <Trans>start a run</Trans>
                        )}
                      </div>
                      {sentinel.lastCheckedAt ? (
                        <div className="mt-1 text-[11px] text-[var(--rk-muted-2)]">
                          <Trans>
                            last checked {new Date(sentinel.lastCheckedAt).toLocaleString()}
                          </Trans>
                        </div>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => cancel(sentinel.id)}
                      disabled={busyId === sentinel.id}
                    >
                      <Trans>Cancel</Trans>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
