import { Trans, useLingui } from "@lingui/react/macro";
import type { PendingApproval } from "@rakazo/contracts";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { rpc } from "../lib/rpc";

const POLL_MS = 15_000;

export function usePendingApprovals(refreshKey = 0) {
  const [items, setItems] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setItems(await rpc.approvals.list());
    } catch {
      // Keep the last good snapshot on transient RPC failures.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const next = await rpc.approvals.list();
        if (!cancelled) setItems(next);
      } catch {
        if (cancelled) return;
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = window.setTimeout(() => void tick(), POLL_MS);
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refreshKey]);

  return { items, loading, refresh, setItems };
}

export function ApprovalsNavButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  const { t } = useLingui();
  const label = count > 0 ? t`Approvals, ${count} pending` : t`Approvals`;
  const badge = count > 9 ? "9+" : String(count);
  return (
    <button
      type="button"
      data-testid="approvals-nav"
      aria-label={label}
      onClick={onOpen}
      className="mb-1 flex w-full items-center gap-3 rounded-xl px-2.5 py-[11px] text-start hover:bg-[var(--rk-hover)]"
    >
      <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--rk-surface-2)] text-[var(--rk-muted)]">
        <ShieldCheck size={15} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-[14.5px] font-medium text-[var(--rk-ink)]">
        <Trans>Approvals</Trans>
      </span>
      {count > 0 ? (
        <span
          data-testid="approvals-badge"
          className="grid min-w-[18px] place-items-center rounded-full bg-[#FF5364] px-1.5 py-0.5 text-[11px] font-medium leading-none text-white"
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function ApprovalsPanelSection({
  items,
  busyId,
  onViewAll,
  onView,
  onApprove,
}: {
  items: PendingApproval[];
  busyId: string | null;
  onViewAll: () => void;
  onView: (item: PendingApproval) => void;
  onApprove: (item: PendingApproval) => void;
}) {
  const { t } = useLingui();
  const count = items.length;
  if (count === 0) return null;
  return (
    <section data-testid="approvals-panel" className="mt-[30px] mb-1">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[14px] text-[var(--rk-muted)]">
          <Trans>Approvals</Trans>
        </span>
        <span className="rounded-full bg-[rgba(255,83,100,.14)] px-2 py-0.5 text-[11.5px] font-medium text-[#FF5364]">
          {t`${count} pending`}
        </span>
        <button
          type="button"
          onClick={onViewAll}
          className="ms-auto text-[13px] text-[var(--rk-body)] hover:text-[var(--rk-ink)]"
        >
          <Trans>View all</Trans>
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {items.slice(0, 3).map((item) => (
          <ApprovalItem
            key={item.id}
            item={item}
            busy={busyId === item.id}
            onView={() => onView(item)}
            onApprove={() => onApprove(item)}
          />
        ))}
      </div>
    </section>
  );
}

export function ApprovalsOverlay({
  items,
  loading,
  busyId,
  onClose,
  onView,
  onApprove,
}: {
  items: PendingApproval[];
  loading: boolean;
  busyId: string | null;
  onClose: () => void;
  onView: (item: PendingApproval) => void;
  onApprove: (item: PendingApproval) => void;
}) {
  const { t } = useLingui();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--rk-overlay)] p-4 sm:p-10">
      <div
        ref={panelRef}
        data-testid="approvals-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approvals-title"
        tabIndex={-1}
        className="rk-scroll max-h-full w-[640px] max-w-full overflow-y-auto rounded-[26px] border border-[var(--rk-hairline)] bg-[var(--rk-surface)] p-6 shadow-[var(--rk-shadow)] sm:p-8"
      >
        <div className="flex items-start justify-between gap-6">
          <h2 id="approvals-title" className="text-2xl font-medium text-[var(--rk-ink)]">
            <Trans>Approvals</Trans>
          </h2>
          <button
            type="button"
            aria-label={t`Close approvals`}
            onClick={onClose}
            className="text-[var(--rk-muted)]"
          >
            ✕
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-2">
          {loading && items.length === 0 ? (
            <p className="text-[14px] text-[var(--rk-muted)]">
              <Trans>Loading…</Trans>
            </p>
          ) : items.length === 0 ? (
            <p className="text-[14px] text-[var(--rk-muted)]">
              <Trans>Nothing waiting</Trans>
            </p>
          ) : (
            items.map((item) => (
              <ApprovalItem
                key={item.id}
                item={item}
                busy={busyId === item.id}
                showBot
                onView={() => onView(item)}
                onApprove={() => onApprove(item)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovalItem({
  item,
  busy,
  showBot,
  onView,
  onApprove,
}: {
  item: PendingApproval;
  busy: boolean;
  showBot?: boolean;
  onView: () => void;
  onApprove: () => void;
}) {
  const { i18n, t } = useLingui();
  const requested = formatRequestedAt(item.requestedAt, i18n.locale || "en");
  const title = showBot && item.botName ? `${item.botName} · ${item.summary}` : item.summary;
  return (
    <div
      data-testid="approval-item"
      className="rounded-[14px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3.5 py-3"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          size={16}
          strokeWidth={1.8}
          className="mt-0.5 shrink-0 text-[#F5A03C]"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 text-[14.5px] font-medium text-[var(--rk-ink)]" dir="auto">
              {title}
            </p>
            {item.highRisk ? (
              <span className="shrink-0 rounded-full bg-[rgba(245,160,60,.16)] px-2 py-0.5 text-[11.5px] font-medium text-[#F5A03C]">
                <Trans>High risk action</Trans>
              </span>
            ) : null}
          </div>
          {requested ? (
            <p className="mt-1 text-[12.5px] text-[var(--rk-muted-2)]">{t`Requested ${requested}`}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={onView}
            className="rounded-[11px] border border-[var(--rk-hairline-strong)] px-3 py-1.5 text-[13px] text-[var(--rk-body)] disabled:opacity-50"
          >
            <Trans>View</Trans>
          </button>
          <button
            type="button"
            data-testid="approval-approve"
            disabled={busy}
            onClick={onApprove}
            className="rounded-[11px] bg-[var(--rk-solid)] px-3 py-1.5 text-[13px] font-medium text-[var(--rk-solid-ink)] disabled:opacity-50"
          >
            {busy ? <Trans>Sending…</Trans> : <Trans>Approve</Trans>}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRequestedAt(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}
