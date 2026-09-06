import { Trans, useLingui } from "@lingui/react/macro";
import type { SkillPromotionSuggestion } from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useEffect, useMemo, useState } from "react";
import { rpc } from "../lib/rpc";

const DISMISS_KEY = "rakazo:skill-promotion:dismissed";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistDismissed(hashes: Set<string>) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...hashes].slice(-200)));
  } catch {
    // A private window without storage just means the card can reappear — harmless.
  }
}

export function SkillPromotionCard({
  botId,
  onCreated,
}: {
  botId: string;
  onCreated?: () => void;
}) {
  const { t } = useLingui();
  const [suggestions, setSuggestions] = useState<SkillPromotionSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    rpc.agentSkills
      .promotionSuggestions({ botId })
      .then((next) => {
        if (!cancelled) setSuggestions(next);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [botId]);

  const current = useMemo(
    () => suggestions.find((s) => !dismissed.has(s.hash)) ?? null,
    [suggestions, dismissed],
  );

  if (!current) return null;

  function dismiss() {
    if (!current) return;
    const next = new Set(dismissed);
    next.add(current.hash);
    setDismissed(next);
    persistDismissed(next);
  }

  async function save() {
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      await rpc.agentSkills.create({ content: current.draft });
      dismiss();
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not create the skill`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-6 mb-2 rounded-[14px] border border-[#2A2A2E] bg-[#151517] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13.5px] text-[#ECECEE]">
            <Trans>
              You've run these {current.tools.length} steps together in {current.runCount} recent
              tasks. Save them as a skill?
            </Trans>
          </div>
          <div className="mt-1 font-mono text-[11.5px] text-[#85858A]">
            {current.tools.join(" → ")}
          </div>
          {error ? <div className="mt-1 text-[12px] text-[#FF5364]">{error}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" onClick={dismiss} disabled={saving}>
            <Trans>Not now</Trans>
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Trans>Saving…</Trans> : <Trans>Save as a skill</Trans>}
          </Button>
        </div>
      </div>
    </div>
  );
}
