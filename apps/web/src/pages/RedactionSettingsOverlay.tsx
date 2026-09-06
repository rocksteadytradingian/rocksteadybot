import { Trans, useLingui } from "@lingui/react/macro";
import {
  REGULATED_REDACTION_POLICY,
  type RedactionEntity,
  RedactionEntitySchema,
  type RedactionPolicy,
} from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

const ENTITY_LABELS: Record<RedactionEntity, string> = {
  EMAIL: "Email addresses",
  PHONE: "Phone numbers",
  CREDIT_CARD: "Card numbers",
  SSN: "Social security numbers",
  PERSON: "People's names",
  MRN: "Medical record numbers",
  US_BANK_NUMBER: "Bank / routing numbers",
  IP_ADDRESS: "IP addresses",
};

export function RedactionSettingsOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useLingui();
  const [policy, setPolicy] = useState<RedactionPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    rpc.redaction
      .get()
      .then((next) => {
        if (!cancelled) setPolicy(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t`Could not load the policy`);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const on = policy ? policy.mode !== "off" : false;

  function patch(next: Partial<RedactionPolicy>) {
    setPolicy((current) => (current ? { ...current, ...next } : current));
    setSaved(false);
  }

  function toggleEnabled(enabled: boolean) {
    if (!policy) return;
    if (enabled) {
      patch({
        mode: policy.mode === "off" ? "box-fill" : policy.mode,
        entities: policy.entities.length
          ? policy.entities
          : [...REGULATED_REDACTION_POLICY.entities],
      });
    } else {
      patch({ mode: "off" });
    }
  }

  function toggleEntity(entity: RedactionEntity) {
    if (!policy) return;
    const has = policy.entities.includes(entity);
    patch({
      entities: has ? policy.entities.filter((e) => e !== entity) : [...policy.entities, entity],
    });
  }

  async function save() {
    if (!policy) return;
    setSaving(true);
    setError(null);
    try {
      setPolicy(await rpc.redaction.set(policy));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not save. You may not be an owner.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,4,5,.62)] p-4 sm:p-10">
      <div className="flex max-h-[min(760px,100%)] w-[560px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[#232326] bg-[#141416] shadow-[0_40px_90px_rgba(0,0,0,.55)]">
        <div className="flex items-start justify-between px-6 pt-6 sm:px-8 sm:pt-7">
          <div>
            <div className="text-2xl font-medium text-[#F1F1F2]">
              <Trans>Screen privacy</Trans>
            </div>
            <div className="mt-1 text-[13.5px] text-[#85858A]">
              <Trans>Black out personal data in screenshots before a bot's model sees them.</Trans>
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
          {!policy ? (
            <div className="text-[13.5px] text-[#6C6C70]">
              <Trans>Loading…</Trans>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <label className="flex items-center justify-between gap-3">
                <span className="text-[14px] text-[#ECECEE]">
                  <Trans>Scrub screenshots for this workspace</Trans>
                </span>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => toggleEnabled(e.target.checked)}
                  className="h-4 w-4 accent-[#4C8DFF]"
                />
              </label>

              {on ? (
                <>
                  <div className="flex gap-2">
                    {(["box-fill", "blur"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={policy.mode === mode}
                        onClick={() => patch({ mode })}
                        className={`flex-1 rounded-[11px] border px-3.5 py-2.5 text-[14px] ${
                          policy.mode === mode
                            ? "border-[#4A4A50] bg-[#1A1A1D] text-[#ECECEE]"
                            : "border-[#26262A] text-[#85858A]"
                        }`}
                      >
                        {mode === "box-fill" ? <Trans>Black box</Trans> : <Trans>Blur</Trans>}
                      </button>
                    ))}
                  </div>

                  <div>
                    <div className="mb-2 text-[13px] text-[#85858A]">
                      <Trans>What to redact</Trans>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {RedactionEntitySchema.options.map((entity) => (
                        <label
                          key={entity}
                          className="flex items-center gap-2 text-[13px] text-[#DFDFE2]"
                        >
                          <input
                            type="checkbox"
                            checked={policy.entities.includes(entity)}
                            onChange={() => toggleEntity(entity)}
                            className="h-3.5 w-3.5 accent-[#4C8DFF]"
                          />
                          {ENTITY_LABELS[entity]}
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="text-[13px] text-[#85858A]">
                    <Trans>Minimum confidence</Trans>{" "}
                    <span className="text-[#DFDFE2]">{policy.minConfidence.toFixed(2)}</span>
                    <input
                      type="range"
                      min={0.3}
                      max={0.95}
                      step={0.05}
                      value={policy.minConfidence}
                      onChange={(e) => patch({ minConfidence: Number(e.target.value) })}
                      className="mt-2 w-full accent-[#4C8DFF]"
                    />
                  </label>

                  <label className="text-[13px] text-[#85858A]">
                    <Trans>Never redact these (one per line)</Trans>
                    <textarea
                      value={(policy.allowlist ?? []).join("\n")}
                      onChange={(e) =>
                        patch({
                          allowlist: e.target.value
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean),
                        })
                      }
                      rows={3}
                      className="mt-2 w-full rounded-[11px] border border-[#26262A] bg-[#0F0F11] px-3 py-2 text-[13px] text-[#ECECEE]"
                    />
                  </label>
                </>
              ) : null}

              {error ? <div className="text-[13px] text-[#FF5364]">{error}</div> : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#1E1E21] px-6 py-4 sm:px-8">
          {saved ? (
            <span className="text-[13px] text-[#4ECB71]">
              <Trans>Saved</Trans>
            </span>
          ) : null}
          <Button onClick={save} disabled={!policy || saving}>
            {saving ? <Trans>Saving…</Trans> : <Trans>Save</Trans>}
          </Button>
        </div>
      </div>
    </div>
  );
}
