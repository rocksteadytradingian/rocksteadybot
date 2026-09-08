import { Plural, Trans, useLingui } from "@lingui/react/macro";
import type { Me } from "@rakazo/contracts";
import {
  COMPLEXITY_ROUTER_MODEL_ID,
  complexityRouterActiveSummary,
  complexityRouterSlotOptions,
  isComplexityRouterProvider,
  isProbedModelProvider,
  OPENAI_COMPATIBLE_PROVIDER_ID,
  openAiCompatibleConnectReady,
  openAiCompatibleProbeSuccessMessage,
  pinActiveModelProviders,
  selectProviderCredential,
  TOKENROUTER_BASE_URL,
  TOKENROUTER_PROVIDER_ID,
  tokenRouterConnectReady,
} from "@rakazo/contracts";
import { Button } from "@rakazo/ui-web";
import { ChevronDown } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { HowItWorks } from "../components/HowItWorks";
import { localizedProviderHint } from "../lib/localized-provider-hint";
import type { ModelCatalogEntry, ModelCredential } from "../lib/model-auth";
import { rpc } from "../lib/rpc";
import { useModelOAuthSignIn } from "../lib/use-model-oauth-signin";

export function ModelSettingsOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useLingui();
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [credentials, setCredentials] = useState<ModelCredential[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [provider, setProvider] = useState("");
  const [providerQuery, setProviderQuery] = useState("");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [probeModels, setProbeModels] = useState<string[]>([]);
  const [probedBaseUrl, setProbedBaseUrl] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"connect" | "default" | "router" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [routerFast, setRouterFast] = useState("");
  const [routerSmart, setRouterSmart] = useState("");
  const [routerHeavy, setRouterHeavy] = useState("");
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const refreshRevisionRef = useRef(0);
  const selectionRevisionRef = useRef(0);
  const probeRequestIdRef = useRef(0);
  const selectedLabelRef = useRef<string | undefined>(undefined);
  const routerDraftRef = useRef({ fast: "", smart: "", heavy: "" });
  const routerSaveSeqRef = useRef(0);
  const routerSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    oauth,
    pasteCode,
    setPasteCode,
    oauthPending,
    cancelOAuthAttempt,
    startSubscriptionSignIn,
    submitOAuthCode,
  } = useModelOAuthSignIn({
    onClearError: () => setError(null),
    onError: setError,
    onFinished: async (controller) => {
      await refresh();
      if (controller.signal.aborted) return;
      setNotice(t`Connected and using ${selectedLabelRef.current ?? "this model"}.`);
    },
  });

  async function refresh() {
    const refreshRevision = ++refreshRevisionRef.current;
    const selectionRevision = selectionRevisionRef.current;
    const [nextCatalog, nextCredentials, nextMe] = await Promise.all([
      rpc.models.list(),
      rpc.models.credentials(),
      rpc.me(),
    ]);
    if (refreshRevision !== refreshRevisionRef.current) return;
    const nextProvider =
      provider && nextCatalog.some((entry) => entry.provider === provider)
        ? provider
        : (nextMe.defaultProvider ?? nextCatalog[0]?.provider ?? "");
    const nextCredential = selectProviderCredential(nextCredentials, nextProvider);
    const nextModel = isProbedModelProvider(nextProvider)
      ? (nextCredential?.modelId ??
        (isProbedModelProvider(nextMe.defaultProvider ?? "") ? nextMe.defaultModel : "") ??
        "")
      : (nextCatalog.find((entry) => entry.provider === nextProvider && entry.id === modelId)?.id ??
        nextCatalog.find(
          (entry) => entry.provider === nextProvider && entry.id === nextMe.defaultModel,
        )?.id ??
        nextCatalog.find((entry) => entry.provider === nextProvider)?.id ??
        "");
    setCatalog(nextCatalog);
    setCredentials(nextCredentials);
    setMe(nextMe);
    if (selectionRevision === selectionRevisionRef.current) {
      setProvider(nextProvider);
      setModelId(nextModel);
      applyRouterDraft(nextCredential);
      if (nextProvider === OPENAI_COMPATIBLE_PROVIDER_ID) {
        const restored = nextCredential?.baseUrl?.trim();
        if (restored) setBaseUrl(restored);
      }
    }
  }

  useEffect(() => {
    void refresh()
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : t`Could not load model settings`),
      )
      .finally(() => setLoading(false));
    return () => {
      refreshRevisionRef.current += 1;
      probeRequestIdRef.current += 1;
      if (routerSaveTimerRef.current) clearTimeout(routerSaveTimerRef.current);
    };
  }, []);

  const groups = useMemo(() => {
    const grouped = new Map<string, ModelCatalogEntry[]>();
    for (const entry of catalog) {
      const entries = grouped.get(entry.provider) ?? [];
      entries.push(entry);
      grouped.set(entry.provider, entries);
    }
    return pinActiveModelProviders(
      [...grouped].map(([id, entries]) => ({
        id,
        name: entries[0]?.providerName ?? id,
        entries,
      })),
      {
        activeProvider: me?.defaultProvider,
        connectedProviders: credentials.map((entry) => entry.provider),
      },
    );
  }, [catalog, credentials, me?.defaultProvider]);
  const filteredGroups = useMemo(() => {
    const query = providerQuery.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter((group) =>
      [
        group.id,
        group.name,
        ...group.entries.flatMap((entry) => [
          entry.id,
          entry.label,
          entry.authHint,
          entry.providerName,
        ]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [groups, providerQuery]);
  const modelsForProvider = catalog.filter((entry) => entry.provider === provider);
  const selected = modelsForProvider.find((entry) => entry.id === modelId) ?? modelsForProvider[0];
  selectedLabelRef.current = selected?.label;
  const isOpenAiCompatible = provider === OPENAI_COMPATIBLE_PROVIDER_ID;
  const isTokenRouter = provider === TOKENROUTER_PROVIDER_ID;
  const isProbedProvider = isProbedModelProvider(provider);
  const credential = selectProviderCredential(credentials, provider);
  const currentEntry = catalog.find(
    (entry) => entry.provider === me?.defaultProvider && entry.id === me?.defaultModel,
  );
  const isActive =
    me?.defaultProvider === selected?.provider &&
    me?.defaultModel === (isProbedProvider ? modelId.trim() : selected?.id);
  const acceptsKey = selected?.auth !== "oauth";
  const subscriptionSignIn = selected?.signIn !== undefined;
  const busy = pending !== null || oauthPending;
  const effectiveBaseUrl = isTokenRouter ? TOKENROUTER_BASE_URL : baseUrl.trim();
  const openAiCompatibleReady = openAiCompatibleConnectReady({
    baseUrl: effectiveBaseUrl,
    modelId,
    probedBaseUrl,
    storedBaseUrl: credential?.baseUrl,
  });
  const tokenRouterReady = tokenRouterConnectReady({
    apiKey,
    modelId,
    probed: probedBaseUrl === TOKENROUTER_BASE_URL,
  });
  const isRouterProvider = isComplexityRouterProvider(provider);
  const defaultCredential = selectProviderCredential(credentials, me?.defaultProvider ?? "");
  const routerSummary = complexityRouterActiveSummary(
    me?.defaultProvider === provider
      ? { fast: routerFast, smart: routerSmart, heavy: routerHeavy }
      : {
          fast: defaultCredential?.routerFastModel,
          smart: defaultCredential?.routerSmartModel,
          heavy: defaultCredential?.routerHeavyModel,
        },
  );
  const showAutoModel = Boolean(routerFast.trim() || credential?.routerFastModel);
  const routerSlotIds = complexityRouterSlotOptions({
    probeModels,
    catalogIds: modelsForProvider
      .filter((entry) => !entry.placeholder && entry.id !== COMPLEXITY_ROUTER_MODEL_ID)
      .map((entry) => entry.id),
    modelId:
      modelId.trim() && modelId !== COMPLEXITY_ROUTER_MODEL_ID
        ? modelId
        : credential?.modelId === COMPLEXITY_ROUTER_MODEL_ID
          ? undefined
          : credential?.modelId,
    routerFastModel: routerFast || credential?.routerFastModel,
    routerSmartModel: routerSmart || credential?.routerSmartModel,
    routerHeavyModel: routerHeavy || credential?.routerHeavyModel,
  });
  const openAiModelChoices = [
    ...(showAutoModel ? [COMPLEXITY_ROUTER_MODEL_ID] : []),
    ...probeModels.filter((id) => id !== COMPLEXITY_ROUTER_MODEL_ID),
  ];

  function applyRouterDraft(nextCredential?: ModelCredential) {
    const draft = {
      fast: nextCredential?.routerFastModel ?? "",
      smart: nextCredential?.routerSmartModel ?? "",
      heavy: nextCredential?.routerHeavyModel ?? "",
    };
    routerDraftRef.current = draft;
    setRouterFast(draft.fast);
    setRouterSmart(draft.smart);
    setRouterHeavy(draft.heavy);
  }

  function updateRouterSlot(key: "fast" | "smart" | "heavy", next: string) {
    const draft = { ...routerDraftRef.current, [key]: next };
    routerDraftRef.current = draft;
    setRouterFast(draft.fast);
    setRouterSmart(draft.smart);
    setRouterHeavy(draft.heavy);
    // Coalesce a quick run of slot changes (fast → smart → heavy) into one save. Overlapping
    // saves race on the server's blind three-column overwrite and an out-of-order one can
    // wipe a slot the user just set.
    if (routerSaveTimerRef.current) clearTimeout(routerSaveTimerRef.current);
    routerSaveTimerRef.current = setTimeout(() => {
      routerSaveTimerRef.current = null;
      void saveRouter(routerDraftRef.current);
    }, 250);
  }

  async function saveRouter(next: { fast: string; smart: string; heavy: string }) {
    if (!credential || !isRouterProvider) return;
    const fast = next.fast.trim();
    if (!fast) return;
    const seq = ++routerSaveSeqRef.current;
    setError(null);
    setNotice(null);
    try {
      await rpc.models.setRouter({
        provider,
        fast,
        smart: next.smart.trim() || null,
        heavy: next.heavy.trim() || null,
      });
      if (seq !== routerSaveSeqRef.current) return;
      await refresh();
    } catch (err) {
      if (seq !== routerSaveSeqRef.current) return;
      const message = err instanceof Error ? err.message : t`Could not save routing`;
      setError(message === "Not Found" ? t`Could not save routing` : message);
    }
  }

  function resetOpenAiCompatibleProbe() {
    probeRequestIdRef.current += 1;
    setProbeModels([]);
    setProbedBaseUrl(null);
    setProbing(false);
  }

  function updateBaseUrl(nextBaseUrl: string) {
    setBaseUrl(nextBaseUrl);
    resetOpenAiCompatibleProbe();
    setError(null);
    setNotice(null);
  }

  function updateApiKey(nextApiKey: string) {
    setApiKey(nextApiKey);
    resetOpenAiCompatibleProbe();
  }

  function chooseProvider(nextProvider: string) {
    cancelOAuthAttempt();
    selectionRevisionRef.current += 1;
    setProvider(nextProvider);
    setModelId(
      isProbedModelProvider(nextProvider)
        ? (selectProviderCredential(credentials, nextProvider)?.modelId ?? "")
        : (catalog.find((entry) => entry.provider === nextProvider)?.id ?? ""),
    );
    applyRouterDraft(selectProviderCredential(credentials, nextProvider));
    setBaseUrl(
      nextProvider === OPENAI_COMPATIBLE_PROVIDER_ID
        ? (selectProviderCredential(credentials, nextProvider)?.baseUrl ?? "")
        : "",
    );
    detailScrollRef.current?.scrollTo({ top: 0 });
    setApiKey("");
    resetOpenAiCompatibleProbe();
    setError(null);
    setNotice(null);
  }

  async function probeServerModels() {
    const trimmedBaseUrl = effectiveBaseUrl;
    if (!trimmedBaseUrl) return;
    if (isTokenRouter && apiKey.trim().length < 8) return;
    resetOpenAiCompatibleProbe();
    const requestId = probeRequestIdRef.current;
    setProbing(true);
    setError(null);
    setNotice(null);
    try {
      const result = await rpc.models.probeOpenAiCompatible({
        baseUrl: trimmedBaseUrl,
        apiKey: apiKey.trim() || undefined,
      });
      if (requestId !== probeRequestIdRef.current) return;
      setProbeModels(result.models);
      setProbedBaseUrl(trimmedBaseUrl);
      setModelId((current) => current.trim() || result.models[0] || "");
      setNotice(openAiCompatibleProbeSuccessMessage(result.models.length));
    } catch (err) {
      if (requestId !== probeRequestIdRef.current) return;
      setError(err instanceof Error ? err.message : t`Could not reach this model server`);
    } finally {
      if (requestId === probeRequestIdRef.current) setProbing(false);
    }
  }

  async function setModelDefault() {
    if (!selected || !credential) return;
    const activeModelId = isProbedProvider ? modelId.trim() : selected.id;
    if (isProbedProvider && !activeModelId) return;
    setError(null);
    setNotice(null);
    setPending("default");
    try {
      await rpc.models.setDefault({ provider: selected.provider, modelId: activeModelId });
      await refresh();
      setNotice(isProbedProvider ? t`Model updated.` : t`Now using ${selected.label}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not change the default model`);
    } finally {
      setPending(null);
    }
  }

  async function connectKey() {
    if (!isProbedProvider && !selected) return;
    if (isTokenRouter) {
      if (!tokenRouterReady) return;
    } else if (isOpenAiCompatible) {
      if (!effectiveBaseUrl || !modelId.trim()) return;
    } else if (!apiKey.trim()) {
      return;
    }
    const connectProvider = selected?.provider ?? provider;
    const fast = routerDraftRef.current.fast.trim();
    const routerFields =
      isRouterProvider && fast
        ? {
            modelId: COMPLEXITY_ROUTER_MODEL_ID,
            routerFastModel: fast,
            routerSmartModel: routerDraftRef.current.smart.trim() || null,
            routerHeavyModel: routerDraftRef.current.heavy.trim() || null,
          }
        : null;
    setError(null);
    setNotice(null);
    setPending("connect");
    try {
      const saved = await rpc.models.connect(
        isOpenAiCompatible
          ? {
              provider: connectProvider,
              baseUrl: effectiveBaseUrl,
              modelId: routerFields?.modelId ?? modelId.trim(),
              apiKey: apiKey.trim() || undefined,
              label: selected?.providerName ?? connectProvider,
              ...(routerFields
                ? {
                    routerFastModel: routerFields.routerFastModel,
                    routerSmartModel: routerFields.routerSmartModel,
                    routerHeavyModel: routerFields.routerHeavyModel,
                  }
                : {}),
            }
          : isTokenRouter
            ? {
                provider: connectProvider,
                apiKey: apiKey.trim(),
                modelId: routerFields?.modelId ?? modelId.trim(),
                label: selected?.providerName ?? connectProvider,
                ...(routerFields
                  ? {
                      routerFastModel: routerFields.routerFastModel,
                      routerSmartModel: routerFields.routerSmartModel,
                      routerHeavyModel: routerFields.routerHeavyModel,
                    }
                  : {}),
              }
            : {
                provider: connectProvider,
                apiKey: apiKey.trim(),
                modelId: selected!.id,
                label: selected!.providerName ?? connectProvider,
              },
      );
      setApiKey("");
      if (saved.baseUrl) setBaseUrl(saved.baseUrl);
      await refresh();
      detailScrollRef.current?.scrollTo({ top: 0 });
      setNotice(
        isProbedProvider
          ? t`Saved.`
          : t`Connected and using ${selected?.label ?? connectProvider}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not connect this provider`);
    } finally {
      setPending(null);
    }
  }

  function handleClose() {
    cancelOAuthAttempt(false);
    onClose();
  }

  function beginSelectedSubscriptionSignIn() {
    if (!selected) return;
    setNotice(null);
    void startSubscriptionSignIn({
      provider: selected.provider,
      modelId: selected.id,
      label: selected.providerName ?? selected.provider,
    });
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--rk-overlay)] p-4 sm:p-10">
      <div className="flex h-[min(760px,100%)] w-[1080px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[var(--rk-hairline)] bg-[var(--rk-surface)] shadow-[var(--rk-shadow)]">
        <div className="flex items-start justify-between px-6 pt-6 sm:px-8 sm:pt-7">
          <div>
            <div className="text-2xl font-medium text-[var(--rk-ink)]">
              <Trans>Models</Trans>
            </div>
            <p className="mt-1 text-[13.5px] text-[var(--rk-muted)]">
              {loading ? (
                <Trans>Loading model catalog…</Trans>
              ) : (
                <Trans>Choose which connected model RocksteadyBot uses.</Trans>
              )}
            </p>
          </div>
          <button
            type="button"
            aria-label={t`Close model settings`}
            onClick={handleClose}
            className="text-[var(--rk-muted)]"
          >
            ✕
          </button>
        </div>

        <div className="mx-6 mt-5 rounded-[14px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-4 py-3 sm:mx-8">
          <div className="text-[12.5px] uppercase tracking-[0.08em] text-[var(--rk-muted-2)]">
            <Trans>Active model</Trans>
          </div>
          <div className="mt-1 text-[16px] text-[var(--rk-ink)]">
            {currentEntry?.label ?? me?.defaultModel ?? t`Deployment default`}
          </div>
          <div className="mt-1 text-[13px] text-[var(--rk-muted)]">
            {currentEntry?.providerName ?? me?.defaultProvider ?? (
              <Trans>Configured by deployment</Trans>
            )}
          </div>
          {routerSummary ? (
            <div className="mt-1 text-[13px] text-[var(--rk-muted)]">{routerSummary}</div>
          ) : null}
        </div>

        <div className="mx-6 mt-4 sm:mx-8">
          <HowItWorks>
            <p>
              <Trans>
                Connect one or more model providers with your own credentials. The bots use
                whichever model is set as active; each turn's cost is billed by your provider.
              </Trans>
            </p>
            <ol>
              <li>
                <Trans>
                  Pick a provider, then either paste an <strong>API key</strong> or run its sign-in.
                  For an OpenAI-compatible server, set the <strong>Server URL</strong>, press{" "}
                  <strong>Find models</strong>, and choose one.
                </Trans>
              </li>
              <li>
                <Trans>Press “Use this model” to make it the active model.</Trans>
              </li>
              <li>
                <Trans>
                  On a router-capable provider, fill the <strong>Fast</strong>,{" "}
                  <strong>Smart</strong>, and <strong>Heavy</strong> slots and set the active model
                  to <strong>Auto</strong> to route each turn by task difficulty.
                </Trans>
              </li>
              <li>
                <Trans>
                  Give one bot a different model in that bot's Settings → Advanced → Model.
                </Trans>
              </li>
            </ol>
          </HowItWorks>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-6 py-6 sm:px-8 md:flex-row">
          <div className="flex min-h-0 shrink-0 flex-col md:w-[310px]">
            <div className="mb-3 text-[13.5px] text-[var(--rk-muted)]">
              <Trans>Providers</Trans>
            </div>
            <label className="sr-only" htmlFor="model-provider-search">
              <Trans>Search providers</Trans>
            </label>
            <input
              id="model-provider-search"
              value={providerQuery}
              onChange={(event) => setProviderQuery(event.target.value)}
              placeholder={t`Search providers`}
              className="w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3.5 py-2.5 text-[14px] text-[var(--rk-ink)] outline-none placeholder:text-[var(--rk-muted)] focus:border-[var(--rk-hairline-strong)]"
            />
            <div className="rk-scroll mt-3 max-h-[240px] overflow-y-auto rounded-[13px] border border-[var(--rk-hairline-strong)] md:min-h-0 md:max-h-none md:flex-1">
              {filteredGroups.length ? (
                filteredGroups.map((group) => {
                  const connected = credentials.some((entry) => entry.provider === group.id);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => chooseProvider(group.id)}
                      className={`flex w-full items-center gap-3 border-b border-[var(--rk-hairline)] px-3.5 py-3 text-start last:border-0 ${
                        group.id === provider
                          ? "bg-[var(--rk-surface-2)]"
                          : "hover:bg-[var(--rk-hover)]"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-[var(--rk-ink)]">
                          {group.name}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-[var(--rk-muted-2)]">
                          <Plural value={group.entries.length} one="# model" other="# models" />
                          {" · "}
                          {localizedProviderHint(group.entries[0]!)}
                        </span>
                      </span>
                      {connected ? (
                        <span className="text-[12px] text-[var(--rk-success)]">
                          <Trans>Connected</Trans>
                        </span>
                      ) : null}
                    </button>
                  );
                })
              ) : (
                <p className="px-3.5 py-4 text-[13px] text-[var(--rk-muted)]">
                  <Trans>No providers found.</Trans>
                </p>
              )}
            </div>
          </div>

          <div ref={detailScrollRef} className="rk-scroll min-h-0 min-w-0 flex-1 overflow-y-auto">
            {error ? <p className="mb-4 text-sm text-[var(--rk-danger)]">{error}</p> : null}
            {notice ? <p className="mb-4 text-sm text-[var(--rk-success)]">{notice}</p> : null}
            {selected || isProbedProvider ? (
              <>
                <div className="block text-[13.5px] text-[var(--rk-muted)]">
                  {isProbedProvider ? (
                    <>
                      {isOpenAiCompatible ? (
                        <>
                          <label className="block">
                            <Trans>Server URL</Trans>
                            <input
                              value={baseUrl}
                              onChange={(event) => updateBaseUrl(event.target.value)}
                              aria-label={t`OpenAI-compatible server URL`}
                              placeholder="http://127.0.0.1:8000/v1"
                              autoComplete="off"
                              className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3.5 py-3 text-[var(--rk-ink)] outline-none"
                            />
                          </label>
                          <details className="mt-2 text-[13px] leading-[1.5] text-[var(--rk-muted)]">
                            <summary className="w-fit cursor-pointer select-none">
                              <Trans>Setup help</Trans>
                            </summary>
                            <p className="mt-1">
                              {t`Paste the OpenAI-compatible address from your server. RocksteadyBot adds /v1 if needed.`}
                            </p>
                          </details>
                        </>
                      ) : null}
                      {isTokenRouter ? (
                        <label className="mb-3 block">
                          {credential ? <Trans>Replace API key</Trans> : <Trans>API key</Trans>}
                          <input
                            aria-label={t`API key`}
                            value={apiKey}
                            onChange={(event) => updateApiKey(event.target.value)}
                            placeholder="sk-…"
                            type="password"
                            autoComplete="new-password"
                            className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3.5 py-3 text-[var(--rk-ink)] outline-none"
                          />
                        </label>
                      ) : null}
                      <div
                        className={
                          isOpenAiCompatible
                            ? "mt-3 flex items-center gap-2"
                            : "flex items-center gap-2"
                        }
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            busy ||
                            probing ||
                            (isTokenRouter ? apiKey.trim().length < 8 : !effectiveBaseUrl)
                          }
                          onClick={() => void probeServerModels()}
                        >
                          {probing ? <Trans>Finding…</Trans> : <Trans>Find models</Trans>}
                        </Button>
                      </div>
                      <div className="mt-4 block">
                        <span>
                          <Trans>Model</Trans>
                        </span>
                        {openAiModelChoices.length && openAiModelChoices.includes(modelId) ? (
                          <div className="relative mt-2">
                            <select
                              value={modelId}
                              onChange={(event) => {
                                cancelOAuthAttempt();
                                selectionRevisionRef.current += 1;
                                setModelId(event.target.value);
                                setError(null);
                                setNotice(null);
                              }}
                              aria-label={t`Models from server`}
                              className="w-full appearance-none rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] py-3 pl-3.5 pr-11 text-sm text-[var(--rk-ink)]"
                            >
                              {showAutoModel ? (
                                <option value={COMPLEXITY_ROUTER_MODEL_ID}>
                                  <Trans>Auto</Trans>
                                </option>
                              ) : null}
                              {probeModels
                                .filter((id) => id !== COMPLEXITY_ROUTER_MODEL_ID)
                                .map((id) => (
                                  <option key={id} value={id}>
                                    {id}
                                  </option>
                                ))}
                              <option value="">
                                <Trans>Other model…</Trans>
                              </option>
                            </select>
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--rk-muted)]"
                            >
                              <ChevronDown size={16} strokeWidth={1.8} />
                            </span>
                          </div>
                        ) : (
                          <input
                            value={modelId}
                            onChange={(event) => {
                              cancelOAuthAttempt();
                              selectionRevisionRef.current += 1;
                              setModelId(event.target.value);
                              setError(null);
                              setNotice(null);
                            }}
                            aria-label={t`Model id`}
                            placeholder="exact-model-id"
                            className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3.5 py-3 text-[var(--rk-ink)] outline-none"
                          />
                        )}
                        {probeModels.length &&
                        !probeModels.includes(modelId) &&
                        modelId !== COMPLEXITY_ROUTER_MODEL_ID ? (
                          <button
                            type="button"
                            className="mt-2 text-[13px] text-[var(--rk-muted)] underline"
                            onClick={() => setModelId(probeModels[0] ?? "")}
                          >
                            <Trans>Use a found model</Trans>
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : selected ? (
                    <>
                      <span>
                        <Trans>Model</Trans>
                      </span>
                      <ModelPicker
                        options={modelsForProvider}
                        value={selected.id}
                        onChange={(nextModelId) => {
                          cancelOAuthAttempt();
                          selectionRevisionRef.current += 1;
                          setModelId(nextModelId);
                          setError(null);
                          setNotice(null);
                        }}
                      />
                    </>
                  ) : null}
                </div>
                {credential && isRouterProvider ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {(
                      [
                        {
                          key: "fast" as const,
                          value: routerFast,
                          label: t`Fast`,
                          accessible: t`Fast — simple`,
                        },
                        {
                          key: "smart" as const,
                          value: routerSmart,
                          label: t`Smart`,
                          accessible: t`Smart — planning and coding`,
                        },
                        {
                          key: "heavy" as const,
                          value: routerHeavy,
                          label: t`Heavy`,
                          accessible: t`Heavy — hard and vision`,
                        },
                      ] as const
                    ).map((slot) => (
                      <div key={slot.key} className="block text-[13.5px] text-[var(--rk-muted)]">
                        {slot.label}
                        {routerSlotIds.length ? (
                          <select
                            value={slot.value}
                            aria-label={slot.accessible}
                            onChange={(event) => updateRouterSlot(slot.key, event.target.value)}
                            className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3 py-2.5 text-[14px] text-[var(--rk-ink)]"
                          >
                            <option value="">{t`Choose…`}</option>
                            {routerSlotIds.map((id) => (
                              <option key={id} value={id}>
                                {id}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            key={`${slot.key}:${slot.value}`}
                            defaultValue={slot.value}
                            aria-label={slot.accessible}
                            placeholder={slot.key === "fast" ? "qwen3:8b" : ""}
                            onBlur={(event) => {
                              const next = event.target.value.trim();
                              if (next === slot.value) return;
                              updateRouterSlot(slot.key, next);
                            }}
                            className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3 py-2.5 text-[14px] text-[var(--rk-ink)]"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
                {!isOpenAiCompatible ? (
                  <p className="mt-2 text-[13px] leading-[1.5] text-[var(--rk-muted)]">
                    {selected?.billing}
                  </p>
                ) : null}

                {!isOpenAiCompatible ? (
                  <div className="mt-5 rounded-[13px] border border-[var(--rk-hairline-strong)] px-4 py-3">
                    <div className="text-[12.5px] uppercase tracking-[0.08em] text-[var(--rk-muted-2)]">
                      <Trans>Personal credential</Trans>
                    </div>
                    <div className="mt-1 text-[15px] text-[var(--rk-ink)]">
                      {credential ? (
                        <Trans>Connected · {credential.label}</Trans>
                      ) : (
                        <Trans>Not connected</Trans>
                      )}
                    </div>
                    <div className="mt-1 text-[13px] text-[var(--rk-muted)]">
                      {credential ? (
                        <Trans>
                          Your key or subscription token is stored securely and is never shown here.
                        </Trans>
                      ) : (
                        <Trans>Connect this provider to use it as your personal model.</Trans>
                      )}
                    </div>
                  </div>
                ) : null}

                {subscriptionSignIn ? (
                  <div className="mt-5">
                    {oauth ? (
                      <div className="rounded-[13px] border border-[var(--rk-hairline-strong)] px-4 py-3">
                        {oauth.mode === "auth-url" ? (
                          <>
                            <p className="text-sm leading-[1.5] text-[var(--rk-muted)]">
                              <Trans>
                                Finish signing in at{" "}
                                <a
                                  href={oauth.verificationUri}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[var(--rk-ink)] underline"
                                >
                                  {new URL(oauth.verificationUri).hostname}
                                </a>
                                . The final page may not load; paste its URL or code here.
                              </Trans>
                            </p>
                            <div className="mt-3 flex items-center gap-2">
                              <input
                                value={pasteCode}
                                onChange={(e) => setPasteCode(e.target.value)}
                                aria-label={t`Authorization code or callback URL`}
                                autoComplete="off"
                                spellCheck={false}
                                placeholder="http://localhost:53692/callback?code=…"
                                className="w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-2.5 text-[13px] text-[var(--rk-ink)]"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!pasteCode.trim()}
                                onClick={() => void submitOAuthCode()}
                              >
                                <Trans>Submit</Trans>
                              </Button>
                            </div>
                            <p className="mt-2 text-sm text-[var(--rk-muted)]">
                              <Trans>Waiting for sign-in…</Trans>
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm leading-[1.5] text-[var(--rk-muted)]">
                              <Trans>
                                Enter this code at{" "}
                                <a
                                  href={oauth.verificationUri}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[var(--rk-ink)] underline"
                                >
                                  {oauth.verificationUri.replace(/^https:\/\//, "")}
                                </a>
                              </Trans>
                            </p>
                            <p className="mt-2 font-mono text-[22px] tracking-[0.2em] text-[var(--rk-ink)]">
                              {oauth.userCode}
                            </p>
                            <p className="mt-2 text-sm text-[var(--rk-muted)]">
                              <Trans>Waiting for sign-in…</Trans>
                            </p>
                          </>
                        )}
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => beginSelectedSubscriptionSignIn()}
                      >
                        {oauthPending ? (
                          <Trans>Starting…</Trans>
                        ) : (
                          (selected.oauthLabel ?? t`Sign in`)
                        )}
                      </Button>
                    )}
                  </div>
                ) : null}

                {acceptsKey ? (
                  <div className="mt-5">
                    {isOpenAiCompatible ? (
                      <details className="text-[13.5px] text-[var(--rk-muted)]">
                        <summary className="w-fit cursor-pointer select-none">
                          <Trans>API key</Trans>
                        </summary>
                        <input
                          aria-label={t`API key`}
                          value={apiKey}
                          onChange={(event) => updateApiKey(event.target.value)}
                          placeholder={t`Optional`}
                          type="password"
                          autoComplete="new-password"
                          className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3.5 py-3 text-[var(--rk-ink)] outline-none"
                        />
                      </details>
                    ) : isTokenRouter ? null : (
                      <label className="block text-[13.5px] text-[var(--rk-muted)]">
                        {credential ? (
                          <Trans>Replace API key</Trans>
                        ) : subscriptionSignIn ? (
                          <Trans>Or connect an API key</Trans>
                        ) : (
                          <Trans>API key</Trans>
                        )}
                        <input
                          value={apiKey}
                          onChange={(event) => updateApiKey(event.target.value)}
                          placeholder="sk-…"
                          type="password"
                          autoComplete="new-password"
                          className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3.5 py-3 text-[var(--rk-ink)] outline-none"
                        />
                      </label>
                    )}
                    <Button
                      type="button"
                      variant="pill"
                      size="sm"
                      disabled={
                        busy ||
                        (isOpenAiCompatible
                          ? !openAiCompatibleReady
                          : isTokenRouter
                            ? !tokenRouterReady
                            : apiKey.trim().length < 8)
                      }
                      onClick={() => void connectKey()}
                      className="mt-3"
                    >
                      {pending === "connect" ? (
                        <Trans>Saving…</Trans>
                      ) : isOpenAiCompatible ? (
                        <Trans>Save</Trans>
                      ) : credential ? (
                        <Trans>Replace API key</Trans>
                      ) : (
                        <Trans>Connect API key</Trans>
                      )}
                    </Button>
                  </div>
                ) : null}

                {selected?.auth === "oauth" && !subscriptionSignIn ? (
                  <p className="mt-5 text-sm leading-[1.5] text-[var(--rk-muted)]">
                    <Trans>
                      This subscription sign-in is not available in RocksteadyBot yet. Use a
                      deployment credential or choose another provider.
                    </Trans>
                  </p>
                ) : null}

                {credential && !isActive ? (
                  <div className="mt-6">
                    <Button
                      type="button"
                      variant="pill"
                      size="sm"
                      disabled={busy || (isProbedProvider && !modelId.trim())}
                      onClick={() => void setModelDefault()}
                    >
                      {pending === "default" ? (
                        <Trans>Switching…</Trans>
                      ) : (
                        <Trans>Use this model</Trans>
                      )}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : loading ? (
              <p className="text-[var(--rk-muted)]">
                <Trans>Loading model catalog…</Trans>
              </p>
            ) : (
              <p className="text-[var(--rk-muted)]">
                <Trans>No model catalog is available.</Trans>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelPicker({
  options,
  value,
  onChange,
}: {
  options: ModelCatalogEntry[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useLingui();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.id === value),
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  const trimmedQuery = query.trim().toLowerCase();
  const filteredOptions = useMemo(
    () =>
      trimmedQuery
        ? options.filter(
            (option) =>
              option.label.toLowerCase().includes(trimmedQuery) ||
              option.id.toLowerCase().includes(trimmedQuery) ||
              (option.providerName ?? option.provider).toLowerCase().includes(trimmedQuery),
          )
        : options,
    [options, trimmedQuery],
  );
  const groups = useMemo(() => {
    const grouped = new Map<string, ModelCatalogEntry[]>();
    for (const option of filteredOptions) {
      const key = option.providerName ?? option.provider;
      const list = grouped.get(key);
      if (list) list.push(option);
      else grouped.set(key, [option]);
    }
    return [...grouped].map(([name, entries]) => ({ name, entries }));
  }, [filteredOptions]);
  const groupRanges = useMemo(() => {
    let index = 0;
    return groups.map((group) => {
      const start = index;
      index += group.entries.length;
      return { name: group.name, start, entries: group.entries };
    });
  }, [groups]);

  useEffect(() => {
    setHighlightedIndex(selectedIndex);
    setOpen(false);
  }, [selectedIndex, value]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  function choose(index: number) {
    const option = filteredOptions[index];
    if (!option) return;
    onChange(option.id);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveHighlight(index: number) {
    const count = filteredOptions.length;
    if (count === 0) return;
    const next = ((index % count) + count) % count;
    setHighlightedIndex(next);
    const option = optionRefs.current[next];
    option?.scrollIntoView({ block: "nearest" });
    // Keep typing focus on the search field; only follow highlight when an option
    // already has focus (e.g. after Tab / prior option key nav).
    if (document.activeElement !== searchRef.current) {
      option?.focus();
    }
  }

  function activeOptionIndex() {
    return highlightedIndex >= 0 && highlightedIndex < filteredOptions.length
      ? highlightedIndex
      : 0;
  }

  function optionDomId(index: number) {
    return `${listboxId}-option-${index}`;
  }

  const activeDescendantId =
    filteredOptions.length > 0 ? optionDomId(activeOptionIndex()) : undefined;

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredOptions.length === 0) return;
      moveHighlight(activeOptionIndex() + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredOptions.length === 0) return;
      moveHighlight(activeOptionIndex() - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      if (filteredOptions.length === 0) return;
      moveHighlight(0);
    } else if (event.key === "End") {
      event.preventDefault();
      if (filteredOptions.length === 0) return;
      moveHighlight(filteredOptions.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (filteredOptions.length === 0) return;
      choose(activeOptionIndex());
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function onTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex(Math.max(0, filteredOptions.length - 1));
    }
  }

  function onOptionKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveHighlight(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveHighlight(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveHighlight(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveHighlight(filteredOptions.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(index);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div ref={rootRef} className="relative mt-2">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={t`Model`}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center justify-between rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3.5 py-3 text-start text-[var(--rk-ink)] outline-none focus-visible:border-[var(--rk-hairline-strong)]"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="min-w-0 truncate">{options[selectedIndex]?.label}</span>
        <span className="ml-3 shrink-0 text-[var(--rk-muted)]" aria-hidden="true">
          <ChevronDown size={16} strokeWidth={1.8} />
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] shadow-[0_20px_45px_rgba(0,0,0,.55)]">
          <input
            ref={searchRef}
            type="text"
            value={query}
            role="combobox"
            aria-label={t`Search models`}
            aria-controls={listboxId}
            aria-expanded={open}
            aria-autocomplete="list"
            aria-activedescendant={activeDescendantId}
            placeholder={t`Search`}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={onSearchKeyDown}
            className="w-full border-b border-[var(--rk-hairline-strong)] bg-transparent px-3 py-2.5 text-[13.5px] text-[var(--rk-ink)] outline-none placeholder:text-[var(--rk-muted)]"
          />
          <div
            id={listboxId}
            role="listbox"
            aria-label={t`Model options`}
            className="rk-scroll max-h-64 overflow-y-auto py-1"
          >
            {groupRanges.map((group) => (
              <div key={group.name}>
                <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--rk-muted-2)]">
                  {group.name}
                </p>
                {group.entries.map((option, groupIndex) => {
                  const index = group.start + groupIndex;
                  return (
                    <ModelOption
                      key={`${option.provider}:${option.id}`}
                      option={option}
                      optionDomId={optionDomId(index)}
                      index={index}
                      value={value}
                      highlighted={highlightedIndex === index}
                      optionRefs={optionRefs}
                      choose={choose}
                      onOptionKeyDown={onOptionKeyDown}
                    />
                  );
                })}
              </div>
            ))}
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-2 text-[13px] text-[var(--rk-muted)]">
                <Trans>No matching models</Trans>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModelOption({
  option,
  optionDomId,
  index,
  value,
  highlighted,
  optionRefs,
  choose,
  onOptionKeyDown,
}: {
  option: ModelCatalogEntry;
  optionDomId: string;
  index: number;
  value: string;
  highlighted: boolean;
  optionRefs: RefObject<Array<HTMLButtonElement | null>>;
  choose: (index: number) => void;
  onOptionKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void;
}) {
  const { t } = useLingui();
  return (
    <button
      id={optionDomId}
      ref={(element) => {
        optionRefs.current[index] = element;
      }}
      type="button"
      role="option"
      aria-selected={option.id === value}
      tabIndex={highlighted ? 0 : -1}
      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-[13.5px] text-[var(--rk-ink)] outline-none hover:bg-[var(--rk-surface-2)] focus-visible:bg-[var(--rk-surface-2)] ${
        highlighted || option.id === value ? "bg-[var(--rk-surface-2)]" : ""
      }`}
      onClick={() => choose(index)}
      onKeyDown={(event) => onOptionKeyDown(event, index)}
    >
      <span className="min-w-0 truncate">{option.label}</span>
      {option.billing.toLowerCase().includes("free") ? (
        <span className="shrink-0 text-[12px] text-[var(--rk-muted)]">{t`Free`}</span>
      ) : null}
    </button>
  );
}
