import type { ModelOAuthBegin } from "@rakazo/contracts";
import {
  COMPLEXITY_ROUTER_MODEL_ID,
  complexityRouterActiveSummary,
  complexityRouterSlotOptions,
  isComplexityRouterProvider,
  isProbedModelProvider,
  OPENAI_COMPATIBLE_BASE_URL_HINT,
  OPENAI_COMPATIBLE_PROVIDER_ID,
  openAiCompatibleConnectReady,
  openAiCompatibleProbeSuccessMessage,
  pinActiveModelProviders,
  selectProviderCredential,
  TOKENROUTER_BASE_URL,
  TOKENROUTER_PROVIDER_ID,
  tokenRouterConnectReady,
} from "@rakazo/contracts";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type MobileMe, type MobileModel, type MobileModelCredential, rpc } from "../lib/api";
import {
  cancelModelOAuthAttempt,
  finishModelOAuthAttempt,
  waitForModelOAuth,
} from "../lib/model-auth";
import { type ThemedStyleArgs, useTheme, useThemedStyles } from "../lib/theme";

type ModelSelection = {
  provider?: string;
  modelId?: string;
};

export default function Models() {
  const [catalog, setCatalog] = useState<MobileModel[]>([]);
  const [credentials, setCredentials] = useState<MobileModelCredential[]>([]);
  const [me, setMe] = useState<MobileMe | null>(null);
  const [provider, setProvider] = useState("");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showEndpointHelp, setShowEndpointHelp] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [probeModels, setProbeModels] = useState<string[]>([]);
  const [probedBaseUrl, setProbedBaseUrl] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [oauth, setOauth] = useState<ModelOAuthBegin | null>(null);
  const [pasteCode, setPasteCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"connect" | "default" | "router" | null>(null);
  const [oauthPending, setOauthPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [routerFast, setRouterFast] = useState("");
  const [routerSmart, setRouterSmart] = useState("");
  const [routerHeavy, setRouterHeavy] = useState("");
  const oauthAbortRef = useRef<AbortController | null>(null);
  const oauthLoginIdRef = useRef<string | null>(null);
  const oauthCodeSubmittingRef = useRef(false);
  const probeRequestIdRef = useRef(0);
  const routerDraftRef = useRef({ fast: "", smart: "", heavy: "" });
  const routerSaveSeqRef = useRef(0);
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const cancelOAuth = useCallback(() => {
    const loginId = oauthLoginIdRef.current;
    oauthLoginIdRef.current = null;
    cancelModelOAuthAttempt(oauthAbortRef, () => {
      setOauth(null);
      setOauthPending(false);
    });
    if (loginId) void rpc("models/cancelOAuth", { loginId }).catch(() => undefined);
  }, []);

  const load = useCallback(async (preferred: ModelSelection = {}) => {
    setError(null);
    const [nextMe, nextCatalog, nextCredentials] = await Promise.all([
      rpc<MobileMe>("me"),
      rpc<MobileModel[]>("models/list"),
      rpc<MobileModelCredential[]>("models/credentials"),
    ]);
    const nextProvider =
      (preferred.provider && nextCatalog.some((entry) => entry.provider === preferred.provider)
        ? preferred.provider
        : nextMe.defaultProvider) ??
      nextCatalog[0]?.provider ??
      "";
    const nextCredential = selectProviderCredential(nextCredentials, nextProvider);
    const nextModel = isProbedModelProvider(nextProvider)
      ? preferred.modelId?.trim() ||
        nextCredential?.modelId ||
        (isProbedModelProvider(nextMe.defaultProvider ?? "") ? nextMe.defaultModel : "") ||
        ""
      : (nextCatalog.find(
          (entry) => entry.provider === nextProvider && entry.id === preferred.modelId,
        )?.id ??
        nextCatalog.find(
          (entry) => entry.provider === nextProvider && entry.id === nextMe.defaultModel,
        )?.id ??
        nextCatalog.find((entry) => entry.provider === nextProvider)?.id ??
        "");
    setMe(nextMe);
    setCatalog(nextCatalog);
    setCredentials(nextCredentials);
    setProvider(nextProvider);
    setModelId(nextModel);
    const draft = {
      fast: nextCredential?.routerFastModel ?? "",
      smart: nextCredential?.routerSmartModel ?? "",
      heavy: nextCredential?.routerHeavyModel ?? "",
    };
    routerDraftRef.current = draft;
    setRouterFast(draft.fast);
    setRouterSmart(draft.smart);
    setRouterHeavy(draft.heavy);
    if (nextProvider === OPENAI_COMPATIBLE_PROVIDER_ID) {
      const restored = nextCredential?.baseUrl?.trim();
      if (restored) setBaseUrl(restored);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load()
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : "Could not load model settings"),
        )
        .finally(() => setLoading(false));
      return () => {
        probeRequestIdRef.current += 1;
        cancelOAuth();
      };
    }, [cancelOAuth, load]),
  );

  const groups = useMemo(() => {
    const grouped = new Map<string, MobileModel[]>();
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
  const modelsForProvider = catalog.filter((entry) => entry.provider === provider);
  const selected = modelsForProvider.find((entry) => entry.id === modelId) ?? modelsForProvider[0];
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

  function updateRouterSlot(key: "fast" | "smart" | "heavy", next: string) {
    const draft = { ...routerDraftRef.current, [key]: next };
    routerDraftRef.current = draft;
    setRouterFast(draft.fast);
    setRouterSmart(draft.smart);
    setRouterHeavy(draft.heavy);
    void saveRouter(draft);
  }

  async function saveRouter(next: { fast: string; smart: string; heavy: string }) {
    if (!credential || !isRouterProvider) return;
    const fast = next.fast.trim();
    if (!fast) return;
    const seq = ++routerSaveSeqRef.current;
    setError(null);
    setNotice(null);
    try {
      await rpc("models/setRouter", {
        provider,
        fast,
        smart: next.smart.trim() || null,
        heavy: next.heavy.trim() || null,
      });
      if (seq !== routerSaveSeqRef.current) return;
      await load({ provider });
    } catch (err) {
      if (seq !== routerSaveSeqRef.current) return;
      const message = err instanceof Error ? err.message : "Could not save routing";
      setError(message === "Not Found" ? "Could not save routing" : message);
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
    cancelOAuth();
    setProvider(nextProvider);
    setModelId(
      isProbedModelProvider(nextProvider)
        ? (selectProviderCredential(credentials, nextProvider)?.modelId ?? "")
        : (catalog.find((entry) => entry.provider === nextProvider)?.id ?? ""),
    );
    const nextCredential = selectProviderCredential(credentials, nextProvider);
    const draft = {
      fast: nextCredential?.routerFastModel ?? "",
      smart: nextCredential?.routerSmartModel ?? "",
      heavy: nextCredential?.routerHeavyModel ?? "",
    };
    routerDraftRef.current = draft;
    setRouterFast(draft.fast);
    setRouterSmart(draft.smart);
    setRouterHeavy(draft.heavy);
    setBaseUrl(
      nextProvider === OPENAI_COMPATIBLE_PROVIDER_ID
        ? (selectProviderCredential(credentials, nextProvider)?.baseUrl ?? "")
        : "",
    );
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
      const result = await rpc<{ models: string[] }>("models/probeOpenAiCompatible", {
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
      setError(err instanceof Error ? err.message : "Could not reach this model server");
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
      await rpc("models/setDefault", { provider: selected.provider, modelId: activeModelId });
      await load({ provider, modelId: activeModelId });
      setNotice(isProbedProvider ? "Model updated." : `Now using ${selected.label}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the default model");
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
      const saved = await rpc<MobileModelCredential>(
        "models/connect",
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
      await load({ provider, modelId: routerFields?.modelId ?? modelId });
      setNotice(isProbedProvider ? "Saved." : `Connected and using ${selected!.label}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect this provider");
    } finally {
      setPending(null);
    }
  }

  async function finishSubscriptionSignIn(loginId: string, controller: AbortController) {
    await waitForModelOAuth(loginId, controller.signal);
    if (controller.signal.aborted) return;
    await rpc("models/finishOAuth", { loginId }, { signal: controller.signal });
    if (controller.signal.aborted) return;
    oauthLoginIdRef.current = null;
    setOauth(null);
    await load({ provider, modelId });
    if (controller.signal.aborted) return;
    setNotice(`Connected and using ${selected?.label ?? "this model"}.`);
  }

  async function startSubscriptionSignIn() {
    if (!selected) return;
    setError(null);
    setNotice(null);
    setOauthPending(true);
    const controller = new AbortController();
    oauthAbortRef.current = controller;
    let waitingForCode = false;
    try {
      const started = await rpc<ModelOAuthBegin>(
        "models/beginOAuth",
        {
          provider: selected.provider,
          modelId: selected.id,
          label: selected.providerName ?? selected.provider,
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      oauthLoginIdRef.current = started.loginId;
      setPasteCode("");
      setOauth(started);
      await Linking.openURL(started.verificationUri);
      waitingForCode = started.mode === "auth-url";
      if (!waitingForCode) await finishSubscriptionSignIn(started.loginId, controller);
    } catch (err) {
      if (controller.signal.aborted) return;
      const loginId = oauthLoginIdRef.current;
      oauthLoginIdRef.current = null;
      if (loginId) void rpc("models/cancelOAuth", { loginId }).catch(() => undefined);
      setError(err instanceof Error ? err.message : "Could not start sign-in");
      setOauth(null);
    } finally {
      if (!waitingForCode) {
        finishModelOAuthAttempt(oauthAbortRef, controller, () => setOauthPending(false));
      }
    }
  }

  async function submitOAuthCode() {
    if (oauth?.mode !== "auth-url" || oauthCodeSubmittingRef.current) return;
    const controller = oauthAbortRef.current;
    const code = pasteCode.trim();
    if (!controller || !code) return;
    oauthCodeSubmittingRef.current = true;
    setPasteCode("");
    setError(null);
    let submitted = false;
    let retryable = false;
    try {
      await rpc(
        "models/submitOAuthCode",
        { loginId: oauth.loginId, code },
        {
          signal: controller.signal,
        },
      );
      submitted = true;
      await finishSubscriptionSignIn(oauth.loginId, controller);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (submitted) {
        oauthLoginIdRef.current = null;
        setOauth(null);
        void rpc("models/cancelOAuth", { loginId: oauth.loginId }).catch(() => undefined);
      } else {
        retryable = true;
        setPasteCode(code);
      }
      setError(err instanceof Error ? err.message : "Could not finish sign-in");
    } finally {
      oauthCodeSubmittingRef.current = false;
      if (!retryable) {
        finishModelOAuthAttempt(oauthAbortRef, controller, () => setOauthPending(false));
      }
    }
  }

  if (loading && catalog.length === 0) {
    return (
      <SafeAreaView edges={["bottom"]} style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={palette.muted} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.activeCard}>
          <Text style={styles.eyebrow}>Active model</Text>
          <Text style={styles.activeModel}>
            {currentEntry?.label ?? me?.defaultModel ?? "Deployment default"}
          </Text>
          <Text style={styles.secondary}>
            {currentEntry?.providerName ?? me?.defaultProvider ?? "Configured by deployment"}
          </Text>
          {routerSummary ? <Text style={styles.secondary}>{routerSummary}</Text> : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        <Text style={styles.sectionTitle}>Providers</Text>
        <View style={styles.card}>
          {groups.map((group) => {
            const connected = credentials.some((entry) => entry.provider === group.id);
            return (
              <Pressable
                key={group.id}
                accessibilityRole="button"
                onPress={() => chooseProvider(group.id)}
                style={({ pressed }) => [
                  styles.providerRow,
                  group.id === provider && styles.selectedRow,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.providerCopy}>
                  <Text style={styles.providerName}>{group.name}</Text>
                  <Text style={styles.secondary}>
                    {group.entries.length} model{group.entries.length === 1 ? "" : "s"}
                  </Text>
                </View>
                {connected ? <Text style={styles.connected}>Connected</Text> : null}
              </Pressable>
            );
          })}
        </View>

        {selected || isProbedProvider ? (
          <>
            {!isProbedProvider ? <Text style={styles.sectionTitle}>Model</Text> : null}
            {isProbedProvider ? (
              <>
                {isOpenAiCompatible ? (
                  <>
                    <Text style={styles.sectionTitle}>Server URL</Text>
                    <TextInput
                      accessibilityLabel="OpenAI-compatible server URL"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!busy}
                      onChangeText={updateBaseUrl}
                      placeholder="http://127.0.0.1:8000/v1"
                      placeholderTextColor={palette.muted2}
                      style={styles.keyInput}
                      value={baseUrl}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showEndpointHelp }}
                      onPress={() => setShowEndpointHelp((visible) => !visible)}
                    >
                      <Text style={styles.helpLabel}>Setup help</Text>
                    </Pressable>
                    {showEndpointHelp ? (
                      <Text style={styles.hint}>{OPENAI_COMPATIBLE_BASE_URL_HINT}</Text>
                    ) : null}
                  </>
                ) : null}
                {isTokenRouter ? (
                  <>
                    <Text style={styles.sectionTitle}>
                      {credential ? "Replace API key" : "API key"}
                    </Text>
                    <TextInput
                      accessibilityLabel="API key"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      editable={!busy}
                      importantForAutofill="no"
                      onChangeText={updateApiKey}
                      placeholder="sk-…"
                      placeholderTextColor={palette.muted2}
                      secureTextEntry
                      style={styles.keyInput}
                      textContentType="none"
                      value={apiKey}
                    />
                  </>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={
                    busy ||
                    probing ||
                    (isTokenRouter ? apiKey.trim().length < 8 : !effectiveBaseUrl)
                  }
                  onPress={() => void probeServerModels()}
                  style={({ pressed }) => [
                    styles.outlineButton,
                    (busy ||
                      probing ||
                      (isTokenRouter ? apiKey.trim().length < 8 : !effectiveBaseUrl)) &&
                      styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.outlineLabel}>{probing ? "Finding…" : "Find models"}</Text>
                </Pressable>
                <Text style={[styles.sectionTitle, { marginTop: 12 }]}>Model</Text>
                {openAiModelChoices.length && openAiModelChoices.includes(modelId) ? (
                  <View style={styles.card}>
                    {showAutoModel ? (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityLabel="Auto"
                        accessibilityState={{ selected: modelId === COMPLEXITY_ROUTER_MODEL_ID }}
                        disabled={probing}
                        onPress={() => setModelId(COMPLEXITY_ROUTER_MODEL_ID)}
                        style={({ pressed }) => [
                          styles.modelRow,
                          modelId === COMPLEXITY_ROUTER_MODEL_ID && styles.selectedRow,
                          probing && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.radio}>
                          {modelId === COMPLEXITY_ROUTER_MODEL_ID ? (
                            <View style={styles.radioDot} />
                          ) : null}
                        </View>
                        <Text style={styles.modelLabel}>Auto</Text>
                      </Pressable>
                    ) : null}
                    {probeModels
                      .filter((entry) => entry !== COMPLEXITY_ROUTER_MODEL_ID)
                      .map((entry) => (
                        <Pressable
                          key={entry}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: entry === modelId }}
                          disabled={probing}
                          onPress={() => setModelId(entry)}
                          style={({ pressed }) => [
                            styles.modelRow,
                            entry === modelId && styles.selectedRow,
                            probing && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={styles.radio}>
                            {entry === modelId ? <View style={styles.radioDot} /> : null}
                          </View>
                          <Text style={styles.modelLabel}>{entry}</Text>
                        </Pressable>
                      ))}
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ selected: false }}
                      disabled={probing}
                      onPress={() => setModelId("")}
                      style={({ pressed }) => [
                        styles.modelRow,
                        probing && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.radio} />
                      <Text style={styles.modelLabel}>Other model…</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <TextInput
                      accessibilityLabel="Model id"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!busy && !probing}
                      onChangeText={setModelId}
                      placeholder="exact-model-id"
                      placeholderTextColor={palette.muted2}
                      style={styles.keyInput}
                      value={modelId}
                    />
                    {probeModels.length ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setModelId(probeModels[0] ?? "")}
                      >
                        <Text style={styles.helpLabel}>Use a found model</Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </>
            ) : selected ? (
              <View style={styles.card}>
                {modelsForProvider.map((entry) => (
                  <Pressable
                    key={`${entry.provider}:${entry.id}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: entry.id === selected.id }}
                    onPress={() => {
                      cancelOAuth();
                      setModelId(entry.id);
                      setError(null);
                      setNotice(null);
                    }}
                    style={({ pressed }) => [
                      styles.modelRow,
                      entry.id === selected.id && styles.selectedRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.radio}>
                      {entry.id === selected.id ? <View style={styles.radioDot} /> : null}
                    </View>
                    <Text style={styles.modelLabel}>{entry.label}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {credential && isRouterProvider ? (
              <View style={{ marginTop: 16, gap: 12 }}>
                {(
                  [
                    {
                      key: "fast" as const,
                      value: routerFast,
                      label: "Fast",
                      accessible: "Fast — simple",
                    },
                    {
                      key: "smart" as const,
                      value: routerSmart,
                      label: "Smart",
                      accessible: "Smart — planning and coding",
                    },
                    {
                      key: "heavy" as const,
                      value: routerHeavy,
                      label: "Heavy",
                      accessible: "Heavy — hard and vision",
                    },
                  ] as const
                ).map((slot) => (
                  <View key={slot.key}>
                    <Text style={styles.sectionTitle}>{slot.label}</Text>
                    {routerSlotIds.length ? (
                      <View style={styles.card}>
                        {routerSlotIds.map((id) => (
                          <Pressable
                            key={id}
                            accessibilityRole="radio"
                            accessibilityLabel={`${slot.accessible}: ${id}`}
                            accessibilityState={{ selected: slot.value === id }}
                            onPress={() => updateRouterSlot(slot.key, id)}
                            style={({ pressed }) => [
                              styles.modelRow,
                              slot.value === id && styles.selectedRow,
                              pressed && styles.pressed,
                            ]}
                          >
                            <View style={styles.radio}>
                              {slot.value === id ? <View style={styles.radioDot} /> : null}
                            </View>
                            <Text style={styles.modelLabel}>{id}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : (
                      <TextInput
                        accessibilityLabel={slot.accessible}
                        autoCapitalize="none"
                        autoCorrect={false}
                        defaultValue={slot.value}
                        placeholder={slot.key === "fast" ? "qwen3:8b" : ""}
                        placeholderTextColor={palette.muted2}
                        onEndEditing={(event) => {
                          const next = event.nativeEvent.text.trim();
                          if (next === slot.value) return;
                          updateRouterSlot(slot.key, next);
                        }}
                        style={styles.keyInput}
                      />
                    )}
                  </View>
                ))}
              </View>
            ) : null}
            {!isOpenAiCompatible ? <Text style={styles.billing}>{selected?.billing}</Text> : null}

            {!isOpenAiCompatible ? (
              <View style={styles.credentialCard}>
                <Text style={styles.eyebrow}>Personal credential</Text>
                <Text style={styles.credentialTitle}>
                  {credential ? `Connected · ${credential.label}` : "Not connected"}
                </Text>
                <Text style={styles.secondary}>
                  {credential
                    ? "Your key or subscription token is stored securely and is never shown here."
                    : "Connect this provider to use it as your personal model."}
                </Text>
              </View>
            ) : null}

            {subscriptionSignIn ? (
              oauth ? (
                <View style={styles.oauthCard}>
                  {oauth.mode === "auth-url" ? (
                    <>
                      <Text style={styles.secondary}>Finish signing in in your browser:</Text>
                      <Pressable onPress={() => void Linking.openURL(oauth.verificationUri)}>
                        <Text style={styles.link}>{oauth.verificationUri}</Text>
                      </Pressable>
                      <Text style={styles.secondary}>
                        The final page may not load. Paste its URL or code here.
                      </Text>
                      <TextInput
                        accessibilityLabel="Authorization code"
                        value={pasteCode}
                        onChangeText={setPasteCode}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="http://localhost:53692/callback?code=…"
                        placeholderTextColor={palette.muted}
                        style={styles.keyInput}
                      />
                      <Pressable
                        accessibilityRole="button"
                        disabled={!pasteCode.trim()}
                        onPress={() => void submitOAuthCode()}
                        style={({ pressed }) => [
                          styles.outlineButton,
                          pressed && styles.pressed,
                          !pasteCode.trim() && styles.disabled,
                        ]}
                      >
                        <Text style={styles.outlineLabel}>Submit</Text>
                      </Pressable>
                      <Text style={styles.secondary}>Waiting for sign-in…</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.secondary}>Enter this code in your browser:</Text>
                      <Pressable onPress={() => void Linking.openURL(oauth.verificationUri)}>
                        <Text style={styles.link}>{oauth.verificationUri}</Text>
                      </Pressable>
                      <Text style={styles.code}>{oauth.userCode}</Text>
                      <Text style={styles.secondary}>Waiting for sign-in…</Text>
                    </>
                  )}
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void startSubscriptionSignIn()}
                  style={({ pressed }) => [
                    styles.outlineButton,
                    pressed && styles.pressed,
                    busy && styles.disabled,
                  ]}
                >
                  <Text style={styles.outlineLabel}>
                    {oauthPending ? "Starting…" : (selected.oauthLabel ?? "Sign in")}
                  </Text>
                </Pressable>
              )
            ) : null}

            {acceptsKey ? (
              <View style={styles.keySection}>
                {isOpenAiCompatible ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showApiKey }}
                      onPress={() => setShowApiKey((visible) => !visible)}
                    >
                      <Text style={styles.helpLabel}>API key</Text>
                    </Pressable>
                    {showApiKey ? (
                      <TextInput
                        accessibilityLabel="API key"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="off"
                        editable={!busy}
                        importantForAutofill="no"
                        onChangeText={updateApiKey}
                        placeholder="Optional"
                        placeholderTextColor={palette.muted2}
                        secureTextEntry
                        style={styles.keyInput}
                        textContentType="none"
                        value={apiKey}
                      />
                    ) : null}
                  </>
                ) : isTokenRouter ? null : (
                  <>
                    <Text style={styles.sectionTitle}>
                      {credential
                        ? "Replace API key"
                        : subscriptionSignIn
                          ? "Or connect an API key"
                          : "API key"}
                    </Text>
                    <TextInput
                      accessibilityLabel="API key"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="off"
                      editable={!busy}
                      importantForAutofill="no"
                      onChangeText={updateApiKey}
                      placeholder="sk-…"
                      placeholderTextColor={palette.muted2}
                      secureTextEntry
                      style={styles.keyInput}
                      textContentType="none"
                      value={apiKey}
                    />
                  </>
                )}
                <Pressable
                  accessibilityRole="button"
                  disabled={
                    busy ||
                    (isOpenAiCompatible
                      ? !openAiCompatibleReady
                      : isTokenRouter
                        ? !tokenRouterReady
                        : apiKey.trim().length < 8)
                  }
                  onPress={() => void connectKey()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    (busy ||
                      (isOpenAiCompatible
                        ? !openAiCompatibleReady
                        : isTokenRouter
                          ? !tokenRouterReady
                          : apiKey.trim().length < 8)) &&
                      styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryLabel}>
                    {pending === "connect"
                      ? "Saving…"
                      : isOpenAiCompatible
                        ? "Save"
                        : credential
                          ? "Replace API key"
                          : "Connect API key"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {selected?.auth === "oauth" && !subscriptionSignIn ? (
              <Text style={styles.secondary}>
                This subscription sign-in is not available in RocksteadyBot yet. Use a deployment
                credential or choose another provider.
              </Text>
            ) : null}

            {credential && !isActive ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy || (isProbedProvider && !modelId.trim())}
                onPress={() => void setModelDefault()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  busy && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryLabel}>
                  {pending === "default" ? "Switching…" : "Use this model"}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = ({ palette }: ThemedStyleArgs) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.page,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
    },
    content: {
      padding: 20,
      gap: 12,
      paddingBottom: 40,
    },
    activeCard: {
      borderRadius: 16,
      backgroundColor: palette.surface,
      padding: 18,
      marginBottom: 8,
    },
    eyebrow: {
      color: palette.muted2,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    activeModel: {
      color: palette.ink,
      fontSize: 19,
      fontWeight: "600",
      marginTop: 6,
    },
    secondary: {
      color: palette.muted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 4,
    },
    sectionTitle: {
      color: palette.muted,
      fontSize: 14,
      marginTop: 8,
      marginBottom: 2,
    },
    card: {
      borderRadius: 14,
      backgroundColor: palette.surface,
      overflow: "hidden",
    },
    providerRow: {
      minHeight: 62,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.hairline,
    },
    providerCopy: {
      flex: 1,
    },
    providerName: {
      color: palette.ink,
      fontSize: 16,
      fontWeight: "600",
    },
    connected: {
      color: palette.success,
      fontSize: 13,
    },
    modelRow: {
      minHeight: 54,
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.hairline,
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: palette.ink,
    },
    modelLabel: {
      flex: 1,
      color: palette.ink,
      fontSize: 15,
    },
    selectedRow: {
      backgroundColor: palette.hover,
    },
    billing: {
      color: palette.muted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 2,
    },
    hint: {
      color: palette.muted,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },
    helpLabel: {
      color: palette.muted,
      fontSize: 13,
      marginTop: 8,
      textDecorationLine: "underline",
    },
    credentialCard: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.hairlineStrong,
      padding: 16,
      marginTop: 8,
    },
    credentialTitle: {
      color: palette.ink,
      fontSize: 16,
      marginTop: 6,
    },
    oauthCard: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.hairlineStrong,
      padding: 16,
      marginTop: 8,
    },
    link: {
      color: palette.link,
      fontSize: 14,
      textDecorationLine: "underline",
      marginTop: 6,
    },
    code: {
      color: palette.ink,
      fontFamily: "monospace",
      fontSize: 24,
      letterSpacing: 3,
      marginTop: 10,
      marginBottom: 2,
    },
    keySection: {
      marginTop: 4,
    },
    keyInput: {
      height: 48,
      borderRadius: 12,
      backgroundColor: palette.input,
      color: palette.ink,
      paddingHorizontal: 14,
      marginTop: 4,
      fontSize: 16,
    },
    primaryButton: {
      minHeight: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: palette.solid,
      marginTop: 12,
      paddingHorizontal: 16,
    },
    primaryLabel: {
      color: palette.solidInk,
      fontSize: 16,
      fontWeight: "700",
    },
    outlineButton: {
      minHeight: 48,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: palette.hairlineStrong,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 12,
      paddingHorizontal: 16,
    },
    outlineLabel: {
      color: palette.ink,
      fontSize: 16,
      fontWeight: "600",
    },
    error: {
      color: palette.danger,
      fontSize: 14,
      marginTop: 4,
    },
    notice: {
      color: palette.success,
      fontSize: 14,
      marginTop: 4,
    },
    disabled: {
      opacity: 0.45,
    },
    pressed: {
      opacity: 0.7,
    },
  });
