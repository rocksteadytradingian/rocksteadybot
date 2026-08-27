import { useLingui } from "@lingui/react/macro";
import { UI_THEMES, type UiThemeId } from "../lib/ui-theme";

export function UiThemePicker({
  value,
  onChange,
}: {
  value: UiThemeId;
  onChange: (id: UiThemeId) => void;
}) {
  const { t } = useLingui();
  return (
    <div role="radiogroup" aria-label={t`Themes`} data-testid="ui-theme-picker">
      {UI_THEMES.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.id)}
            className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[var(--rk-hover)]"
          >
            <span
              className={`relative h-6 w-6 shrink-0 overflow-hidden rounded-full border ${
                selected
                  ? "border-[var(--rk-ink)] ring-2 ring-[var(--rk-ink)] ring-offset-2 ring-offset-[var(--rk-surface-2)]"
                  : "border-[var(--rk-hairline-strong)]"
              }`}
              style={{ background: option.swatch }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 end-0 w-1/2"
                style={{ background: option.accent }}
              />
            </span>
            <span className="flex-1 text-start text-[14.5px] text-[var(--rk-ink)]">
              {option.label}
            </span>
            {selected ? (
              <span aria-hidden className="text-[12px] text-[var(--rk-muted)]">
                ✓
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
