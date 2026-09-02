import { Trans, useLingui } from "@lingui/react/macro";
import type { ComposioProjectKeyStatus } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useState } from "react";
import { rpc } from "../lib/rpc";

export function ComposioProjectKeySettings({
  status,
  onChange,
}: {
  status: ComposioProjectKeyStatus | null;
  onChange: (status: ComposioProjectKeyStatus) => void;
}) {
  const { t } = useLingui();
  const [apiKey, setApiKey] = useState("");
  const [pending, setPending] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configured = status?.configured ?? false;
  const userSaved = status?.source === "user";

  async function save() {
    if (!apiKey.trim()) return;
    setError(null);
    setPending("save");
    try {
      const next = await rpc.connections.setProjectKey({ apiKey: apiKey.trim() });
      setApiKey("");
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not save that project key`);
    } finally {
      setPending(null);
    }
  }

  async function remove() {
    setError(null);
    setPending("remove");
    try {
      onChange(await rpc.connections.clearProjectKey());
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not save that project key`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mb-6 rounded-[16px] border border-[var(--rk-hairline)] bg-[var(--rk-surface-2)] px-4 py-3">
      <div className="text-[12.5px] uppercase tracking-[0.08em] text-[var(--rk-muted-2)]">
        <Trans>Project key</Trans>
      </div>
      <div className="mt-1 text-[13.5px] text-[var(--rk-muted)]">
        {userSaved ? (
          <Trans>Saved for this account</Trans>
        ) : status?.source === "server" ? (
          <Trans>Using the server project key</Trans>
        ) : (
          <Trans>Paste a Platform project key (ak_…), not a For You consumer key</Trans>
        )}
      </div>
      <label className="mt-3 block">
        <span className="sr-only">
          <Trans>Composio project key</Trans>
        </span>
        <input
          type="password"
          name="composio-project-key"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={configured ? t`Paste a replacement key` : t`ak_…`}
          className="w-full rounded-[11px] border border-[var(--rk-hairline)] bg-[var(--rk-input)] px-3.5 py-2.5 text-[14px] text-[var(--rk-ink)] outline-none"
        />
      </label>
      {error ? <p className="mt-2 text-sm text-[#C94244]">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="pill"
          size="sm"
          disabled={pending !== null || apiKey.trim().length < 8}
          onClick={() => void save()}
        >
          {pending === "save" ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
        </Button>
        {userSaved ? (
          <Button
            type="button"
            variant="pill"
            size="sm"
            disabled={pending !== null}
            onClick={() => void remove()}
          >
            {pending === "remove" ? <Trans>Removing…</Trans> : <Trans>Remove</Trans>}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
