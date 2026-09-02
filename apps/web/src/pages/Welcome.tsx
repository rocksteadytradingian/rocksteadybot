import { Trans } from "@lingui/react/macro";
import { PRODUCT_NAME } from "@rakazo/contracts";
import { useNavigate } from "react-router-dom";
import { WindowChrome } from "./WindowChrome";

export function WelcomePage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full flex-col bg-[var(--rk-page)]">
      <div className="app-drag flex gap-2 px-5 py-[18px]">
        <WindowChrome />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-11 pb-[90px]">
        <div className="flex items-center gap-[26px]">
          <div className="flex h-[88px] w-[88px] items-center justify-center gap-[13px] rounded-full bg-[var(--rk-mark)]">
            <span className="h-6 w-[11px] rounded-full bg-[var(--rk-mark-dot)]" />
            <span className="h-6 w-[11px] rounded-full bg-[var(--rk-mark-dot)]" />
          </div>
          <div className="text-[52px] leading-none tracking-[-0.04em] text-[var(--rk-ink)] md:text-[64px]">
            {PRODUCT_NAME}
          </div>
        </div>
        <p className="max-w-[600px] text-center text-[27px] leading-[1.4] text-[var(--rk-body)]">
          <Trans>
            Your team of always-on agents
            <br />
            that you can give real work to.
          </Trans>
        </p>
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/sign-in")}
            className="app-no-drag rounded-full bg-[var(--rk-solid)] px-[34px] py-[15px] text-[19px] text-[var(--rk-solid-ink)] transition hover:scale-[1.04]"
          >
            <Trans>Sign in&nbsp;&nbsp;→</Trans>
          </button>
          <button
            type="button"
            onClick={() => navigate("/sign-up")}
            className="app-no-drag text-[17px] font-medium text-[var(--rk-ink)] underline underline-offset-4"
          >
            <Trans>Sign up</Trans>
          </button>
        </div>
      </div>
    </div>
  );
}
