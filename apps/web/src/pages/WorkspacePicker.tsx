import { Trans, useLingui } from "@lingui/react/macro";
import type { Workspace } from "@rakazo/contracts";
import { ChevronDown } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export function WorkspacePicker({
  workspaces,
  workspaceId,
  busy,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: {
  workspaces: Workspace[];
  workspaceId: string;
  busy?: boolean;
  onSwitch: (workspaceId: string) => Promise<void> | void;
  onCreate: (name: string) => Promise<void> | void;
  onRename: (workspaceId: string, name: string) => Promise<void> | void;
  onDelete: (workspaceId: string) => Promise<void> | void;
}) {
  const { t } = useLingui();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const selectedIndex = Math.max(
    0,
    workspaces.findIndex((workspace) => workspace.id === workspaceId),
  );
  const current = workspaces[selectedIndex] ?? workspaces[0];
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  const [draft, setDraft] = useState<"create" | "rename" | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    setHighlightedIndex(selectedIndex);
    setOpen(false);
    setDraft(null);
    setName("");
  }, [selectedIndex, workspaceId]);

  useEffect(() => {
    if (!open) return;
    if (draft) {
      nameRef.current?.focus();
      return;
    }
    optionRefs.current[highlightedIndex]?.focus();
  }, [draft, highlightedIndex, open]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setDraft(null);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  async function choose(index: number) {
    const next = workspaces[index];
    if (!next || next.id === workspaceId || busy) return;
    setOpen(false);
    await onSwitch(next.id);
  }

  async function submitDraft() {
    const nextName = name.trim();
    if (!nextName || busy) return;
    if (draft === "create") {
      setOpen(false);
      setDraft(null);
      await onCreate(nextName);
      return;
    }
    if (draft === "rename" && current) {
      setOpen(false);
      setDraft(null);
      await onRename(current.id, nextName);
    }
  }

  async function removeCurrent() {
    if (!current || workspaces.length < 2 || busy) return;
    const confirmed = window.confirm(t`Delete this workspace and its bots?`);
    if (!confirmed) return;
    setOpen(false);
    await onDelete(current.id);
  }

  function moveHighlight(index: number) {
    if (workspaces.length === 0) return;
    setHighlightedIndex((index + workspaces.length) % workspaces.length);
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setDraft(null);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex(Math.max(0, workspaces.length - 1));
    }
  }

  function onOptionKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setHighlightedIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setHighlightedIndex(workspaces.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void choose(index);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div ref={rootRef} className="app-no-drag relative mx-3.5 mb-3">
      <div className="px-0.5 pb-1 text-[11px] font-medium tracking-[0.04em] text-[var(--rk-muted-2)]">
        <Trans>Workspace</Trans>
      </div>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        data-testid="workspace-select"
        aria-label={t`Workspace`}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={busy}
        className="flex w-full items-center justify-between rounded-xl border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] px-3 py-2 text-start outline-none focus-visible:border-[var(--rk-ink)]"
        onClick={() =>
          setOpen((currentOpen) => {
            if (currentOpen) setDraft(null);
            return !currentOpen;
          })
        }
        onKeyDown={onTriggerKeyDown}
      >
        <span className="min-w-0 truncate text-[14px] font-medium text-[var(--rk-ink)]">
          {current?.name ?? t`Workspace`}
        </span>
        <span className="ml-3 shrink-0 text-[var(--rk-muted)]" aria-hidden="true">
          <ChevronDown size={16} strokeWidth={1.8} />
        </span>
      </button>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t`Workspace`}
          className="rk-scroll absolute left-0 right-0 top-full z-30 mt-2 overflow-y-auto rounded-xl border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] py-1 shadow-lg"
        >
          {workspaces.map((workspace, index) => (
            <button
              key={workspace.id}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="option"
              aria-selected={workspace.id === workspaceId}
              tabIndex={index === highlightedIndex ? 0 : -1}
              className={`flex w-full items-center justify-between px-3.5 py-2 text-start text-[14px] text-[var(--rk-ink)] outline-none hover:bg-[var(--rk-surface-2)] focus-visible:bg-[var(--rk-surface-2)] ${
                workspace.id === workspaceId ? "bg-[var(--rk-surface-2)]" : ""
              }`}
              onClick={() => void choose(index)}
              onKeyDown={(event) => onOptionKeyDown(event, index)}
            >
              <span className="min-w-0 truncate">{workspace.name}</span>
              {workspace.id === workspaceId ? (
                <span aria-hidden className="ml-3 text-[12px] text-[var(--rk-muted)]">
                  ✓
                </span>
              ) : null}
            </button>
          ))}
          <div className="my-1 border-t border-[var(--rk-hairline)]" />
          {draft ? (
            <form
              className="px-2 pb-1"
              onSubmit={(event) => {
                event.preventDefault();
                void submitDraft();
              }}
            >
              <input
                ref={nameRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder={draft === "rename" ? t`Workspace name` : t`New workspace`}
                aria-label={draft === "rename" ? t`Workspace name` : t`New workspace`}
                className="w-full rounded-lg border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-2.5 py-1.5 text-[13.5px] text-[var(--rk-ink)] outline-none"
              />
            </form>
          ) : (
            <>
              <button
                type="button"
                className="block w-full px-3.5 py-2 text-start text-[14px] text-[var(--rk-ink)] hover:bg-[var(--rk-surface-2)]"
                onClick={() => {
                  setDraft("create");
                  setName("");
                }}
              >
                <Trans>New workspace</Trans>
              </button>
              {current ? (
                <button
                  type="button"
                  className="block w-full px-3.5 py-2 text-start text-[14px] text-[var(--rk-ink)] hover:bg-[var(--rk-surface-2)]"
                  onClick={() => {
                    setDraft("rename");
                    setName(current.name);
                  }}
                >
                  <Trans>Rename</Trans>
                </button>
              ) : null}
              {workspaces.length > 1 ? (
                <button
                  type="button"
                  className="block w-full px-3.5 py-2 text-start text-[14px] text-[#E24B4A] hover:bg-[var(--rk-surface-2)]"
                  onClick={() => void removeCurrent()}
                >
                  <Trans>Delete workspace</Trans>
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
