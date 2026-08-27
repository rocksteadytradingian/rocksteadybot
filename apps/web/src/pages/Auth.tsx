import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth";

export function AuthPage({ mode }: { mode: "in" | "up" }) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const title =
    mode === "in" ? <Trans>Sign in to RocksteadyBot</Trans> : <Trans>Create your RocksteadyBot</Trans>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result =
      mode === "up"
        ? await authClient.signUp.email({
            email,
            password,
            name: name || email.split("@")[0] || "User",
          })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? t`Could not continue`);
      return;
    }
    navigate(mode === "up" ? "/onboarding" : "/app");
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--rk-page)] px-6 py-16 text-[var(--rk-ink)]">
      <form onSubmit={submit} className="flex w-[460px] flex-col items-center">
        <div className="flex h-[74px] w-[74px] items-center justify-center gap-[11px] rounded-full bg-[var(--rk-mark)]">
          <span className="h-5 w-[9px] rounded-full bg-[var(--rk-mark-dot)]" />
          <span className="h-5 w-[9px] rounded-full bg-[var(--rk-mark-dot)]" />
        </div>
        <h1 className="mb-[38px] mt-[30px] text-[38px] tracking-[-0.02em]">{title}</h1>
        {mode === "up" ? (
          <label className="mb-4 w-full text-[16px] text-[var(--rk-muted)]">
            <Trans>Name</Trans>
            <input
              id="name"
              name="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t`Your name`}
              className="mt-2 w-full rounded-[13px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-[18px] py-[17px] text-[17px] text-[var(--rk-ink)] outline-none"
            />
          </label>
        ) : null}
        <label className="w-full text-[16px] text-[var(--rk-muted)]">
          <Trans>Email</Trans>
          <input
            id="email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t`Your email address`}
            type="email"
            required
            className="mt-2 w-full rounded-[13px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-[18px] py-[17px] text-[17px] text-[var(--rk-ink)] outline-none"
          />
        </label>
        <label className="mt-4 w-full text-[16px] text-[var(--rk-muted)]">
          <Trans>Password</Trans>
          <input
            id={mode === "in" ? "current-password" : "new-password"}
            name="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t`Password`}
            type="password"
            required
            minLength={8}
            className="mt-2 w-full rounded-[13px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-[18px] py-[17px] text-[17px] text-[var(--rk-ink)] outline-none"
          />
        </label>
        {error ? <p className="mt-3 w-full text-sm text-[#C94244]">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-3 w-full rounded-[13px] bg-[var(--rk-solid)] py-[18px] text-center text-[17px] font-medium text-[var(--rk-solid-ink)] hover:opacity-90"
        >
          {pending ? (
            <Trans>Working…</Trans>
          ) : mode === "in" ? (
            <Trans>Continue with email</Trans>
          ) : (
            <Trans>Create account</Trans>
          )}
        </button>
        <p className="mt-[30px] text-[16px] text-[var(--rk-muted-2)]">
          {mode === "in" ? (
            <>
              <Trans>Don’t have an account?</Trans>{" "}
              <Link to="/sign-up" className="font-medium text-[var(--rk-ink)]">
                <Trans>Sign up</Trans>
              </Link>
            </>
          ) : (
            <>
              <Trans>Already have an account?</Trans>{" "}
              <Link to="/sign-in" className="font-medium text-[var(--rk-ink)]">
                <Trans>Sign in</Trans>
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
