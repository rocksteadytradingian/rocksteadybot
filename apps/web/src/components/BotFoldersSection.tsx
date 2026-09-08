import { Trans, useLingui } from "@lingui/react/macro";
import type { BotFolder, ComputerMode } from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { desktopBridge } from "../lib/desktop";
import { rpc } from "../lib/rpc";

/**
 * Folders on the host machine this one bot may use as a working directory.
 * Scoped per bot: another bot sharing the same computer does not inherit them.
 */
export function BotFoldersSection({
  botId,
  computerMode,
}: {
  botId: string;
  computerMode?: ComputerMode;
}) {
  const { t } = useLingui();
  const [folders, setFolders] = useState<BotFolder[] | undefined>(undefined);
  const [pathDraft, setPathDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickFolders = desktopBridge()?.pickFolders;

  useEffect(() => {
    let live = true;
    setFolders(undefined);
    setError(null);
    rpc.botFolders
      .list({ botId })
      .then((rows) => live && setFolders(rows))
      .catch((err: unknown) => {
        if (!live) return;
        setError(err instanceof Error ? err.message : t`Could not load folders`);
        setFolders([]);
      });
    return () => {
      live = false;
    };
  }, [botId, t]);

  async function add(rawPath: string) {
    const path = rawPath.trim();
    if (!path || busy) return;
    setBusy(true);
    setError(null);
    try {
      const folder = await rpc.botFolders.add({ botId, path });
      setFolders((current) => {
        const rest = (current ?? []).filter((entry) => entry.id !== folder.id);
        return [...rest, folder].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      setPathDraft("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not add that folder`);
    } finally {
      setBusy(false);
    }
  }

  async function browse() {
    if (!pickFolders || busy) return;
    setError(null);
    let picked: string[] = [];
    try {
      picked = await pickFolders();
    } catch {
      setError(t`Could not open the folder picker`);
      return;
    }
    for (const path of picked) await add(path);
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await rpc.botFolders.remove({ botId, id });
      setFolders((current) => (current ?? []).filter((entry) => entry.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not remove that folder`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-[30px]">
      <div className="mb-3 text-[14px] text-[var(--rk-muted)]">
        <Trans>Folders</Trans>
      </div>

      {error ? <p className="mb-2 text-[13px] text-[var(--rk-danger)]">{error}</p> : null}

      {computerMode === "team" ? (
        <p className="mb-2 px-2.5 text-[13px] leading-[1.5] text-[var(--rk-muted-2)]">
          <Trans>
            Folders only mount on a Private computer — switch this bot to Private above.
          </Trans>
        </p>
      ) : null}

      {folders?.map((folder) => (
        <div
          key={folder.id}
          className="flex items-center gap-2 rounded-[11px] px-2.5 py-2.5 hover:bg-[var(--rk-hover)]"
        >
          <span
            className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--rk-ink)]"
            dir="auto"
            title={folder.path}
          >
            {folder.label || folder.path}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove(folder.id)}
            className="shrink-0 text-[13px] text-[var(--rk-muted-2)] hover:text-[var(--rk-danger)] disabled:opacity-40"
          >
            <Trans>Remove</Trans>
          </button>
        </div>
      ))}

      {folders !== undefined && folders.length === 0 && !adding ? (
        <p className="px-2.5 text-[13px] leading-[1.5] text-[var(--rk-muted-2)]">
          <Trans>No folders — this bot stays inside its own workspace.</Trans>
        </p>
      ) : null}

      {folders !== undefined && folders.length > 0 && computerMode !== "team" ? (
        <div className="mt-1 rounded-[10px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] px-3 py-2.5 text-[12.5px] leading-[1.6] text-[var(--rk-muted-2)]">
          <p>
            <Trans>Mounted read-write at /mnt/folders/&lt;name&gt; inside the computer.</Trans>
          </p>
          <p className="mt-1">
            <Trans>
              After adding or removing a folder, restart the computer for the change to take effect:
              use “Recover computer” below, or stop the computer and send the bot a message. A
              running computer keeps its old folders until then.
            </Trans>
          </p>
        </div>
      ) : null}

      {adding ? (
        <div className="rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] px-3 py-3">
          <input
            value={pathDraft}
            onChange={(event) => setPathDraft(event.target.value)}
            disabled={busy}
            spellCheck={false}
            placeholder={t`Absolute folder path`}
            className="w-full rounded-[10px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3 py-2 text-[14px] text-[var(--rk-ink)] outline-none disabled:opacity-40"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {pickFolders ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void browse()}
                className="rounded-[11px] border border-[var(--rk-hairline-strong)] px-4 py-2 text-[14px] text-[var(--rk-ink)] disabled:opacity-40"
              >
                <Trans>Browse…</Trans>
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || !pathDraft.trim()}
              onClick={() => void add(pathDraft)}
              className="rounded-[11px] bg-[var(--rk-solid)] px-4 py-2 text-[14px] text-[var(--rk-solid-ink)] disabled:opacity-40"
            >
              {busy ? <Trans>Adding…</Trans> : <Trans>Add</Trans>}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setPathDraft("");
                setError(null);
              }}
              className="rounded-[11px] border border-[var(--rk-hairline-strong)] px-4 py-2 text-[14px] text-[var(--rk-ink)]"
            >
              <Trans>Cancel</Trans>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2.5 px-2.5 py-2.5 text-[14.5px] text-[var(--rk-muted)]"
        >
          <Trans>+ Add folder</Trans>
        </button>
      )}
    </div>
  );
}
