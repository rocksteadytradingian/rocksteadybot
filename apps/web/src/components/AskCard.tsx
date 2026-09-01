import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type { ThreadMessage } from "@rakazo/contracts";
import { isApprovalAskBlock } from "@rakazo/core";
import { useState } from "react";

export type AskBlock = Extract<ThreadMessage["blocks"][number], { kind: "ask" }>;

function formatAnsweredState(answer: string | undefined, approval: boolean): string {
  if (!answer) return t`Answered`;
  if (!approval) return t`Answered: ${answer}`;
  if (answer === "allow") return t`Allowed once`;
  if (answer === "always") return t`Always allowed`;
  if (answer === "deny") return t`Denied`;
  return t`Answered: ${answer}`;
}

function approvalActionLabel(id: string, fallback: string): string {
  if (id === "allow") return t`Allow once`;
  if (id === "always") return t`Always allow this tool`;
  if (id === "deny") return t`Deny`;
  return fallback;
}

export function AskCard({
  block,
  canAnswer,
  onAnswer,
}: {
  block: AskBlock;
  canAnswer: boolean;
  onAnswer: (text: string) => Promise<void>;
}) {
  const { t } = useLingui();
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitting = pendingAction !== null;
  const approvalActions = isApprovalAskBlock(block) ? block.actions : undefined;

  async function submitAnswer(value: string) {
    const text = value.trim();
    if (!text || submitting) return;
    setPendingAction(text);
    setError(null);
    try {
      await onAnswer(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not submit this answer`);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="max-w-[74%] rounded-[20px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] px-5 py-[17px]">
      <div className="text-[15.5px] leading-[1.5] text-[var(--rk-ink)]">
        <ChatMarkdown>{block.text}</ChatMarkdown>
      </div>
      {block.detail ? (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--rk-input)] px-3.5 py-3 font-mono text-[12.5px] leading-[1.7] text-[var(--rk-muted)]">
          {block.detail}
        </pre>
      ) : null}
      {block.status === "answered" ? (
        <div className="mt-3.5 text-[13.5px] font-medium text-[var(--rk-success)]">
          {formatAnsweredState(block.answer, Boolean(approvalActions))}
        </div>
      ) : !canAnswer ? (
        <div className="mt-3.5 text-[13.5px] font-medium text-[var(--rk-muted)]">
          <Trans>No longer active</Trans>
        </div>
      ) : approvalActions ? (
        <div className="mt-3.5 flex gap-2">
          {approvalActions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={submitting}
              onClick={() => void submitAnswer(action.id)}
              className={
                action.id === "allow"
                  ? "rounded-[11px] bg-[var(--rk-solid)] px-[17px] py-2 text-[14.5px] font-medium text-[var(--rk-solid-ink)] disabled:opacity-50"
                  : "rounded-[11px] border border-[var(--rk-hairline-strong)] px-[17px] py-2 text-[14.5px] text-[var(--rk-body)] disabled:opacity-50"
              }
            >
              {pendingAction === action.id ? (
                <Trans>Sending…</Trans>
              ) : (
                approvalActionLabel(action.id, action.label)
              )}
            </button>
          ))}
        </div>
      ) : editing ? (
        <form
          className="mt-3.5 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submitAnswer(answer);
          }}
        >
          <input
            aria-label={t`Answer`}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder={t`Type your answer`}
            className="rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3.5 py-2.5 text-[14.5px] text-[var(--rk-ink)] outline-none focus:border-[var(--rk-hairline-strong)]"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!answer.trim() || submitting}
              className="rounded-[11px] bg-[var(--rk-solid)] px-[17px] py-2 text-[14.5px] font-medium text-[var(--rk-solid-ink)] disabled:opacity-50"
            >
              {submitting ? <Trans>Sending…</Trans> : <Trans>Send answer</Trans>}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setAnswer("");
                setEditing(false);
              }}
              className="rounded-[11px] border border-[var(--rk-hairline-strong)] px-[17px] py-2 text-[14.5px] text-[var(--rk-body)] disabled:opacity-50"
            >
              <Trans>Cancel</Trans>
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-3.5 flex gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitAnswer("approved")}
            className="rounded-[11px] bg-[var(--rk-solid)] px-[17px] py-2 text-[14.5px] font-medium text-[var(--rk-solid-ink)] disabled:opacity-50"
          >
            {submitting ? <Trans>Sending…</Trans> : <Trans>Send it</Trans>}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setEditing(true)}
            className="rounded-[11px] border border-[var(--rk-hairline-strong)] px-[17px] py-2 text-[14.5px] text-[var(--rk-body)] disabled:opacity-50"
          >
            <Trans>Edit first</Trans>
          </button>
        </div>
      )}
      {error ? <p className="mt-3 text-[13px] text-[var(--rk-danger)]">{error}</p> : null}
    </div>
  );
}
