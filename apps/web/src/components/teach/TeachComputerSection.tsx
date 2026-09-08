import { Trans, useLingui } from "@lingui/react/macro";
import type { ComputerStatus, TaughtSkill, TaughtSkillSurface } from "@rakazo/contracts";
import { useMemo, useState } from "react";
import { rpc } from "../../lib/rpc";
import { TeachRecordingChrome } from "./TeachRecordingChrome";

export function TeachComputerSection({
  botId,
  computer,
  skills,
  busy: busyProp,
  onRefresh,
  onOpenComputer,
  onStopTeaching,
  onAddRoutine,
  browserAvailable = false,
}: {
  botId: string;
  computer: ComputerStatus | null;
  skills: TaughtSkill[];
  busy?: boolean;
  onRefresh: () => Promise<void>;
  onOpenComputer: () => Promise<void>;
  onStopTeaching?: () => Promise<void>;
  onAddRoutine: (skill: TaughtSkill) => void;
  /** A browser driver is configured on this deployment. */
  browserAvailable?: boolean;
}) {
  const { t } = useLingui();
  const [goalOpen, setGoalOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [surface, setSurface] = useState<TaughtSkillSurface>("computer");
  const [localBusy, setLocalBusy] = useState(false);
  const busy = Boolean(busyProp) || localBusy;
  const recording = useMemo(
    () => skills.find((skill) => skill.status === "recording") ?? null,
    [skills],
  );
  const saved = useMemo(
    () => skills.filter((skill) => skill.status === "saved" || skill.status === "draft"),
    [skills],
  );
  const teachAvailable = Boolean(computer && computer.kind !== "desktop");

  async function startTeaching() {
    if (!goal.trim() || busy) return;
    setLocalBusy(true);
    try {
      await rpc.computer.boot({ botId });
      await rpc.skills.start({ botId, goal: goal.trim(), surface });
      setGoalOpen(false);
      setGoal("");
      setSurface("computer");
      await onOpenComputer();
      await onRefresh();
    } finally {
      setLocalBusy(false);
    }
  }

  async function stopTeaching() {
    if (!recording || busy) return;
    if (onStopTeaching) {
      await onStopTeaching();
      return;
    }
    setLocalBusy(true);
    try {
      await rpc.skills.stop({ skillId: recording.id });
      await onRefresh();
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <div className="mt-[30px]">
      <div className="mb-3 text-[14px] text-[var(--rk-muted)]">
        <Trans>Teach a task</Trans>
      </div>
      {!teachAvailable ? (
        <div className="rounded-[11px] border border-[var(--rk-hairline-strong)] px-3 py-3 text-[13.5px] leading-[1.5] text-[var(--rk-muted-2)]">
          {computer?.kind === "desktop" ? (
            <Trans>
              Teaching needs a graphical sandbox computer. Desktop-host bots can run shell tasks,
              but not screen recording.
            </Trans>
          ) : (
            <Trans>Open the computer view on web or desktop to teach a task.</Trans>
          )}
        </div>
      ) : recording ? (
        <TeachRecordingChrome
          recording={recording}
          busy={busy}
          onStop={stopTeaching}
          variant="panel"
        />
      ) : goalOpen ? (
        <div className="rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] px-3 py-3">
          <div className="mb-2 text-[13px] text-[var(--rk-muted)]">
            <Trans>Where does this run?</Trans>
          </div>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              aria-pressed={surface === "computer"}
              data-testid="teach-surface-computer"
              onClick={() => setSurface("computer")}
              className={`flex-1 rounded-[11px] border px-3.5 py-2.5 text-[14px] ${
                surface === "computer"
                  ? "border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)] text-[var(--rk-ink)]"
                  : "border-[var(--rk-hairline)] text-[var(--rk-muted)]"
              }`}
            >
              <Trans>Bot's computer</Trans>
            </button>
            <button
              type="button"
              aria-pressed={surface === "browser"}
              data-testid="teach-surface-browser"
              disabled={!browserAvailable}
              onClick={() => browserAvailable && setSurface("browser")}
              title={browserAvailable ? undefined : t`No browser is configured on this deployment`}
              className={`flex-1 rounded-[11px] border px-3.5 py-2.5 text-[14px] ${
                !browserAvailable
                  ? "cursor-not-allowed border-[var(--rk-hairline-strong)] text-[var(--rk-muted-2)] opacity-60"
                  : surface === "browser"
                    ? "border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)] text-[var(--rk-ink)]"
                    : "border-[var(--rk-hairline)] text-[var(--rk-muted)]"
              }`}
            >
              {browserAvailable ? (
                <Trans>My browser</Trans>
              ) : (
                <Trans>My browser (unavailable)</Trans>
              )}
            </button>
          </div>
          <label htmlFor="teach-goal-input" className="text-[13px] text-[var(--rk-muted)]">
            <Trans>What result will you demonstrate?</Trans>
          </label>
          <textarea
            id="teach-goal-input"
            data-testid="teach-goal-input"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            rows={3}
            className="mt-2 w-full rounded-[10px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3 py-2 text-[14px] text-[var(--rk-ink)] outline-none"
            placeholder={t`Export this week's list from the CRM and drop it in the shared folder`}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy || !goal.trim()}
              onClick={() => void startTeaching()}
              className="rounded-[11px] bg-[var(--rk-solid)] px-4 py-2 text-[14px] text-[var(--rk-solid-ink)] disabled:opacity-40"
            >
              {busy ? <Trans>Starting…</Trans> : <Trans>Start recording</Trans>}
            </button>
            <button
              type="button"
              onClick={() => setGoalOpen(false)}
              className="rounded-[11px] border border-[var(--rk-hairline-strong)] px-4 py-2 text-[14px] text-[var(--rk-ink)]"
            >
              <Trans>Cancel</Trans>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid="teach-start-button"
          onClick={() => setGoalOpen(true)}
          className="flex items-center gap-2.5 px-2.5 py-2.5 text-[14.5px] text-[var(--rk-muted)]"
        >
          <Trans>+ Teach a task</Trans>
        </button>
      )}

      {saved.length > 0 ? (
        <>
          <div className="mt-[22px] mb-3 text-[14px] text-[var(--rk-muted)]">
            <Trans>Saved skills</Trans>
          </div>
          {saved.map((skill) => (
            <div
              key={skill.id}
              className="mb-2 rounded-[11px] border border-[var(--rk-hairline-strong)] px-3 py-3"
            >
              <div className="text-[14px] text-[var(--rk-ink)]">{skill.name || skill.goal}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setLocalBusy(true);
                    try {
                      await rpc.skills.testRun({ skillId: skill.id });
                      await onRefresh();
                    } finally {
                      setLocalBusy(false);
                    }
                  }}
                  className="rounded-[11px] border border-[var(--rk-hairline-strong)] px-3 py-1.5 text-[13px] text-[var(--rk-ink)]"
                >
                  <Trans>Test</Trans>
                </button>
                <button
                  type="button"
                  onClick={() => onAddRoutine(skill)}
                  className="rounded-[11px] border border-[var(--rk-hairline-strong)] px-3 py-1.5 text-[13px] text-[var(--rk-ink)]"
                >
                  <Trans>Add to routine</Trans>
                </button>
                <button
                  type="button"
                  disabled={busy || skill.status !== "draft"}
                  onClick={async () => {
                    setLocalBusy(true);
                    try {
                      await rpc.skills.save({ skillId: skill.id });
                      await onRefresh();
                    } finally {
                      setLocalBusy(false);
                    }
                  }}
                  className="rounded-[11px] bg-[var(--rk-solid)] px-3 py-1.5 text-[13px] text-[var(--rk-solid-ink)] disabled:opacity-40"
                >
                  <Trans>Save</Trans>
                </button>
              </div>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
