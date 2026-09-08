import { Trans, useLingui } from "@lingui/react/macro";
import type { BrowserSignIn, BrowserTeachActionInput, BrowserTeachView } from "@rakazo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { rpc } from "../../lib/rpc";

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

interface TreeElement {
  ref: string;
  role: string;
  name: string;
}

/** Parse `- role "name" [ref=eN]` lines out of a playwright-mcp accessibility tree. */
function parseElements(tree: string): TreeElement[] {
  const out: TreeElement[] = [];
  for (const line of tree.split("\n")) {
    const match = line.match(/-\s*([a-zA-Z]+)\s+"([^"]*)"\s*\[ref=([^\]]+)\]/);
    const [, role, name, ref] = match ?? [];
    if (role && ref) out.push({ role, name: name ?? "", ref });
  }
  return out;
}

const ACTIONABLE = new Set([
  "link",
  "button",
  "textbox",
  "combobox",
  "checkbox",
  "radio",
  "tab",
  "menuitem",
  "option",
  "searchbox",
]);

export function BrowserTeachPane({ botId }: { botId: string }) {
  const { t } = useLingui();
  const [view, setView] = useState<BrowserTeachView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [typeDraft, setTypeDraft] = useState("");
  const [submitAfter, setSubmitAfter] = useState(false);
  const [signIns, setSignIns] = useState<BrowserSignIn[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSignIns = useCallback(async () => {
    try {
      setSignIns(await rpc.skills.browserSignIns({ botId }));
    } catch {
      // leave the last list
    }
  }, [botId]);

  const refresh = useCallback(async () => {
    try {
      const next = await rpc.skills.browserView({ botId });
      setView(next);
    } catch {
      // transient — keep the last view
    }
  }, [botId]);

  useEffect(() => {
    void refresh();
    void loadSignIns();
    pollRef.current = setInterval(() => {
      if (!busy) void refresh();
    }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh, loadSignIns, busy]);

  async function run(action: BrowserTeachActionInput) {
    setBusy(true);
    setError(null);
    try {
      const next = await rpc.skills.browserAction({ botId, action });
      setView(next);
      setTypeDraft("");
      setSubmitAfter(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`That step could not be recorded`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmSignIn(origin: string) {
    try {
      setSignIns(await rpc.skills.browserConfirmSignIn({ botId, origin }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not save the sign-in`);
    }
  }

  async function forgetSignIn(origin: string) {
    try {
      setSignIns(await rpc.skills.browserForgetSignIn({ botId, origin }));
    } catch {
      // ignore
    }
  }

  const elements = view ? parseElements(view.tree) : [];
  const actionable = elements.filter((element) => ACTIONABLE.has(element.role));
  const selected = actionable.find((element) => element.ref === selectedRef) ?? null;
  const selectedIsTextField =
    selected?.role === "textbox" || selected?.role === "searchbox" || selected?.role === "combobox";
  const currentOrigin = view ? originOf(view.url) : null;
  const currentSignedIn = currentOrigin
    ? signIns.some((entry) => entry.origin === currentOrigin)
    : false;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--rk-main)]">
      <form
        className="flex items-center gap-2 border-b border-[var(--rk-hairline-strong)] px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (urlDraft.trim()) void run({ kind: "navigate", url: urlDraft.trim() });
        }}
      >
        <input
          value={urlDraft}
          onChange={(event) => setUrlDraft(event.target.value)}
          placeholder={view?.url || t`https://…`}
          className="min-w-0 flex-1 rounded-[9px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3 py-1.5 text-[13px] text-[var(--rk-ink)] outline-none"
        />
        <button
          type="submit"
          disabled={busy || !urlDraft.trim()}
          className="rounded-[9px] bg-[var(--rk-solid)] px-3 py-1.5 text-[13px] text-[var(--rk-solid-ink)] disabled:opacity-40"
        >
          <Trans>Go</Trans>
        </button>
      </form>

      {error ? (
        <div role="alert" className="rk-banner-danger border-b px-3 py-1.5 text-[12px]">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--rk-hairline-strong)] px-3 py-1.5 text-[12px]">
        {currentOrigin ? (
          currentSignedIn ? (
            <span className="text-[var(--rk-muted)]">
              <Trans>Signed in to {currentOrigin}</Trans>{" "}
              <button
                type="button"
                onClick={() => void forgetSignIn(currentOrigin)}
                className="underline"
              >
                <Trans>remove</Trans>
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void confirmSignIn(currentOrigin)}
              className="rounded-[8px] border border-[var(--rk-hairline-strong)] px-2.5 py-1 text-[var(--rk-ink)]"
            >
              <Trans>Mark this bot signed in to {currentOrigin}</Trans>
            </button>
          )
        ) : (
          <span className="text-[var(--rk-muted-2)]">
            <Trans>Navigate to a site and sign in there so scheduled runs can use it.</Trans>
          </span>
        )}
        {signIns.length > 0 ? (
          <span className="text-[var(--rk-muted-2)]">
            · {signIns.map((entry) => entry.origin.replace(/^https?:\/\//, "")).join(", ")}
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-auto bg-black p-2">
          {view?.screenshot ? (
            <img
              src={view.screenshot}
              alt={view.title || t`Browser`}
              className="mx-auto max-w-full"
            />
          ) : (
            <div className="grid h-full place-items-center text-[13px] text-[var(--rk-muted-2)]">
              <Trans>Opening the browser…</Trans>
            </div>
          )}
        </div>

        <div className="flex w-[280px] min-w-[280px] flex-col border-l border-[var(--rk-hairline-strong)]">
          <div className="border-b border-[var(--rk-hairline-strong)] px-3 py-2 text-[12px] text-[var(--rk-muted)]">
            {view ? view.title || view.url : ""}
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {actionable.map((element) => (
              <button
                key={element.ref}
                type="button"
                onClick={() => setSelectedRef(element.ref)}
                className={`block w-full truncate px-3 py-1.5 text-left text-[13px] ${
                  selectedRef === element.ref
                    ? "bg-[var(--rk-surface-2)] text-[var(--rk-ink)]"
                    : "text-[var(--rk-body)]"
                }`}
                title={`${element.role} · ${element.name}`}
              >
                <span className="text-[var(--rk-muted-2)]">{element.role}</span> {element.name}
              </button>
            ))}
            {actionable.length === 0 && view ? (
              <div className="px-3 py-2 text-[12px] text-[var(--rk-muted-2)]">
                <Trans>No actionable elements on this page.</Trans>
              </div>
            ) : null}
          </div>

          <div className="border-t border-[var(--rk-hairline-strong)] p-3">
            {selected ? (
              <div className="mb-2 truncate text-[12px] text-[var(--rk-muted)]">
                {selected.role} · {selected.name}
              </div>
            ) : (
              <div className="mb-2 text-[12px] text-[var(--rk-muted-2)]">
                <Trans>Pick an element to act on it.</Trans>
              </div>
            )}
            {selectedIsTextField ? (
              <>
                <input
                  value={typeDraft}
                  onChange={(event) => setTypeDraft(event.target.value)}
                  placeholder={t`Text to type`}
                  className="mb-2 w-full rounded-[9px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-2.5 py-1.5 text-[13px] text-[var(--rk-ink)] outline-none"
                />
                <label className="mb-2 flex items-center gap-2 text-[12px] text-[var(--rk-body)]">
                  <input
                    type="checkbox"
                    checked={submitAfter}
                    onChange={(event) => setSubmitAfter(event.target.checked)}
                  />
                  <Trans>Press Enter after</Trans>
                </label>
                <button
                  type="button"
                  disabled={busy || !selected}
                  onClick={() =>
                    selected &&
                    void run({
                      kind: "type",
                      ref: selected.ref,
                      text: typeDraft,
                      submit: submitAfter,
                    })
                  }
                  className="w-full rounded-[9px] bg-[var(--rk-solid)] px-3 py-1.5 text-[13px] text-[var(--rk-solid-ink)] disabled:opacity-40"
                >
                  <Trans>Type</Trans>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={busy || !selected}
                onClick={() => selected && void run({ kind: "click", ref: selected.ref })}
                className="w-full rounded-[9px] bg-[var(--rk-solid)] px-3 py-1.5 text-[13px] text-[var(--rk-solid-ink)] disabled:opacity-40"
              >
                <Trans>Click</Trans>
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const expect = window.prompt(t`What should be true here?`);
                if (expect) void run({ kind: "checkpoint", expect });
              }}
              className="mt-2 w-full rounded-[9px] border border-[var(--rk-hairline-strong)] px-3 py-1.5 text-[13px] text-[var(--rk-ink)] disabled:opacity-40"
            >
              <Trans>Add checkpoint</Trans>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
