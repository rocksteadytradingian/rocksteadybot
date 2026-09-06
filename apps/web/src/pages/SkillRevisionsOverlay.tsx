import { Trans, useLingui } from "@lingui/react/macro";
import type { AgentSkill } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

export function SkillRevisionsOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useLingui();
  const [skills, setSkills] = useState<AgentSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCurrent, setShowCurrent] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    rpc.agentSkills
      .revisions()
      .then(setSkills)
      .catch((err) => setError(err instanceof Error ? err.message : t`Could not load revisions`));
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    rpc.agentSkills
      .revisions()
      .then((next) => {
        if (!cancelled) setSkills(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t`Could not load revisions`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function act(skillId: string, kind: "apply" | "dismiss") {
    setBusyId(skillId);
    setError(null);
    try {
      if (kind === "apply") await rpc.agentSkills.applyRevision({ skillId });
      else await rpc.agentSkills.dismissRevision({ skillId });
      setSkills((current) => current?.filter((s) => s.id !== skillId) ?? current);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not update the skill`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,4,5,.62)] p-4 sm:p-10">
      <div className="flex max-h-[min(820px,100%)] w-[640px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[#232326] bg-[#141416] shadow-[0_40px_90px_rgba(0,0,0,.55)]">
        <div className="flex items-start justify-between px-6 pt-6 sm:px-8 sm:pt-7">
          <div>
            <div className="text-2xl font-medium text-[#F1F1F2]">
              <Trans>Skill revisions</Trans>
            </div>
            <div className="mt-1 text-[13.5px] text-[#85858A]">
              <Trans>
                Proposed edits drafted after a run that followed a skill failed its check. Nothing
                changes until you accept.
              </Trans>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t`Close`}
            className="rounded-[10px] px-2 py-1 text-[#85858A] hover:bg-[#1E1E21] hover:text-[#ECECEE]"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-8">
          {error ? <div className="mb-4 text-[13px] text-[#FF5364]">{error}</div> : null}

          {skills === null ? (
            <div className="text-[13.5px] text-[#6C6C70]">
              <Trans>Loading…</Trans>
            </div>
          ) : skills.length === 0 ? (
            <div className="text-[13.5px] text-[#6C6C70]">
              <Trans>No skills have a pending revision.</Trans>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {skills.map((skill) => {
                const revision = skill.pendingRevision;
                if (!revision) return null;
                const current = showCurrent[skill.id] ?? false;
                return (
                  <div
                    key={skill.id}
                    className="rounded-[16px] border border-[#26262A] bg-[#0F0F11] p-4"
                  >
                    <div className="text-[15px] font-medium text-[#ECECEE]">{skill.name}</div>
                    <div className="mt-1 text-[13px] text-[#B7B7BC]">{revision.reason}</div>
                    <div className="mt-1 text-[11.5px] text-[#6C6C70]">
                      <Trans>
                        Drafted {new Date(revision.createdAt).toLocaleString()} from run{" "}
                        {revision.runId.slice(0, 8)}
                      </Trans>
                    </div>

                    <div className="mt-3 flex gap-2 text-[12px]">
                      <button
                        type="button"
                        aria-pressed={!current}
                        onClick={() => setShowCurrent((s) => ({ ...s, [skill.id]: false }))}
                        className={`rounded-[9px] px-2.5 py-1 ${
                          !current
                            ? "bg-[#1A1A1D] text-[#ECECEE]"
                            : "text-[#85858A] hover:text-[#ECECEE]"
                        }`}
                      >
                        <Trans>Proposed</Trans>
                      </button>
                      <button
                        type="button"
                        aria-pressed={current}
                        onClick={() => setShowCurrent((s) => ({ ...s, [skill.id]: true }))}
                        className={`rounded-[9px] px-2.5 py-1 ${
                          current
                            ? "bg-[#1A1A1D] text-[#ECECEE]"
                            : "text-[#85858A] hover:text-[#ECECEE]"
                        }`}
                      >
                        <Trans>Current</Trans>
                      </button>
                    </div>

                    <pre className="mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap rounded-[10px] border border-[#232326] bg-[#0B0B0D] p-3 text-[12px] leading-[1.5] text-[#CFCFD3]">
                      {current ? skill.content : revision.content}
                    </pre>

                    <div className="mt-3 flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => act(skill.id, "dismiss")}
                        disabled={busyId === skill.id}
                      >
                        <Trans>Dismiss</Trans>
                      </Button>
                      <Button onClick={() => act(skill.id, "apply")} disabled={busyId === skill.id}>
                        {busyId === skill.id ? <Trans>Working…</Trans> : <Trans>Accept</Trans>}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
