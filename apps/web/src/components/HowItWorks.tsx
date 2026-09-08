import { Trans } from "@lingui/react/macro";
import type { ReactNode } from "react";

/**
 * Collapsed-by-default "How this works" panel for a settings overlay.
 * Keeps the surrounding UI minimal while giving new users the steps on demand.
 */
export function HowItWorks({ children }: { children: ReactNode }) {
  return (
    <details className="mb-4 rounded-[12px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] px-3.5 py-3 [&[open]_summary]:mb-2">
      <summary className="cursor-pointer text-[13px] font-medium text-[var(--rk-body)] marker:text-[var(--rk-muted-2)]">
        <Trans>How this works</Trans>
      </summary>
      <div className="space-y-2 text-[13px] leading-[1.6] text-[var(--rk-muted)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--rk-input)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ol]:marker:text-[var(--rk-muted-2)] [&_strong]:text-[var(--rk-body)]">
        {children}
      </div>
    </details>
  );
}
