import type {
  CapabilityInstall,
  ComposioProjectKeyStatus,
  Connection,
  ConnectionCatalogItem,
} from "@rakazo/contracts";
import {
  abortableDelay,
  buildFeaturedConnectorTiles,
  buildPluginSections,
  EMPTY_PLUGIN_CATALOG_MESSAGE,
  enrichPluginCatalogItem,
  type PluginMarketplaceFilter,
  pluginDescriptionFor,
  presentPluginCategories,
  selectPluginEntries,
} from "@rakazo/core";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { rpc } from "../lib/api";
import { loadLastBotId } from "../lib/last-bot";
import { native } from "../lib/native";

type SourceKind = "treg" | "mcp" | "api";

const PLUGIN_FILTER_LABELS: Record<PluginMarketplaceFilter, string> = {
  all: "All",
  featured: "Featured",
  installed: "Installed",
  "customer-support": "Customer Support",
  "data-analytics": "Data Analytics",
  design: "Design",
  "documents-and-files": "Documents And Files",
  "finance-and-legal": "Finance And Legal",
  "inbox-and-collaboration": "Inbox And Collaboration",
  infrastructure: "Infrastructure",
  payments: "Payments",
  productivity: "Productivity",
  research: "Research",
  sales: "Sales",
  scheduling: "Scheduling",
  more: "More",
};

export default function Integrations() {
  const { width } = useWindowDimensions();
  const catalogColumns = width >= 480 ? 2 : 1;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PluginMarketplaceFilter>("all");
  const [catalog, setCatalog] = useState<ConnectionCatalogItem[]>([]);
  const [sources, setSources] = useState<CapabilityInstall[]>([]);
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [credential, setCredential] = useState("");
  const [requiresAuth, setRequiresAuth] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [lastBotId, setLastBotId] = useState("");
  const [catalogReady, setCatalogReady] = useState(false);
  const [projectKey, setProjectKey] = useState<ComposioProjectKeyStatus | null>(null);
  const [projectKeyInput, setProjectKeyInput] = useState("");
  const [projectKeyBusy, setProjectKeyBusy] = useState(false);
  const connectionAttempt = useRef<AbortController | null>(null);

  const entries = useMemo(() => catalog.map(enrichPluginCatalogItem), [catalog]);
  const featuredTiles = useMemo(() => buildFeaturedConnectorTiles(catalog), [catalog]);
  const chips = useMemo(() => presentPluginCategories(entries), [entries]);
  const searching = query.trim().length > 0;
  const sections = useMemo(
    () => buildPluginSections(entries, { filter, query }),
    [entries, filter, query],
  );
  const visibleEntries = useMemo(
    () => selectPluginEntries(entries, { filter, query }),
    [entries, filter, query],
  );
  const showFeatured = !searching && (filter === "all" || filter === "featured");
  const showCategorySections = !searching && filter === "all";
  const showFlatCatalog = searching || (filter !== "all" && filter !== "featured");

  async function refresh() {
    const catalogResult = await rpc<ConnectionCatalogItem[]>("connections/catalog");
    setCatalog(catalogResult);
    setCatalogReady(true);
    try {
      const [installs, keyStatus] = await Promise.all([
        rpc<CapabilityInstall[]>("capabilities/list"),
        rpc<ComposioProjectKeyStatus>("connections/projectKey"),
      ]);
      setSources(installs.filter((item) => item.kind === "mcp" || item.kind === "api"));
      setProjectKey(keyStatus);
    } catch {
      // Tool sources are optional; keep featured/catalog usable if this fails.
    }
  }

  useEffect(() => {
    void refresh().catch((reason) => {
      setCatalogReady(false);
      setCatalogError(reason instanceof Error ? reason.message : "Could not load plugins");
    });
    void loadLastBotId().then(setLastBotId);
    return () => connectionAttempt.current?.abort();
  }, []);

  function closeAdvanced() {
    setAdvancedOpen(false);
    setSourceKind(null);
    setSourceError(null);
    setName("");
    setUrl("");
    setCredential("");
    setRequiresAuth(true);
  }

  async function saveProjectKey() {
    const apiKey = projectKeyInput.trim();
    if (apiKey.length < 8) return;
    setProjectKeyBusy(true);
    setCatalogError(null);
    try {
      const next = await rpc<ComposioProjectKeyStatus>("connections/setProjectKey", { apiKey });
      setProjectKey(next);
      setProjectKeyInput("");
      await refresh();
    } catch (reason) {
      setCatalogError(reason instanceof Error ? reason.message : "Could not save that project key");
    } finally {
      setProjectKeyBusy(false);
    }
  }

  async function clearProjectKey() {
    setProjectKeyBusy(true);
    setCatalogError(null);
    try {
      setProjectKey(await rpc<ComposioProjectKeyStatus>("connections/clearProjectKey"));
    } catch (reason) {
      setCatalogError(reason instanceof Error ? reason.message : "Could not save that project key");
    } finally {
      setProjectKeyBusy(false);
    }
  }

  async function notifyAppConnected(item: ConnectionCatalogItem) {
    const botId = lastBotId || (await loadLastBotId());
    if (!botId) return;
    if (botId !== lastBotId) setLastBotId(botId);
    void rpc("onboarding/appConnected", { botId, provider: item.slug }).catch(() => undefined);
  }

  async function connect(item: ConnectionCatalogItem) {
    connectionAttempt.current?.abort();
    const controller = new AbortController();
    connectionAttempt.current = controller;
    const key = `${item.connectorId}:${item.slug}`;
    setPending(key);
    setCatalogError(null);
    try {
      const started = await rpc<{ connectionId: string; authorizationUrl: string | null }>(
        "connections/begin",
        {
          connectorId: item.connectorId,
          provider: item.slug,
          displayName: item.name,
        },
      );
      if (started.authorizationUrl) await Linking.openURL(started.authorizationUrl);
      for (let attempt = 0; attempt < 45; attempt += 1) {
        if (controller.signal.aborted) return;
        const row = await rpc<Connection>("connections/complete", {
          connectionId: started.connectionId,
        }).catch(() => undefined);
        if (row?.status === "connected") {
          if (controller.signal.aborted) return;
          void notifyAppConnected(item);
          await refresh();
          return;
        }
        await abortableDelay(2_000, controller.signal);
      }
      if (controller.signal.aborted) return;
      Alert.alert(
        "Connection pending",
        "Finish connecting in the browser, then refresh this page.",
      );
    } catch (reason) {
      if (controller.signal.aborted) return;
      setCatalogError(reason instanceof Error ? reason.message : "Could not connect");
    } finally {
      if (connectionAttempt.current === controller) {
        connectionAttempt.current = null;
        setPending(null);
      }
    }
  }

  async function revoke(item: ConnectionCatalogItem) {
    const key = `${item.connectorId}:${item.slug}`;
    setPending(key);
    setCatalogError(null);
    const connections = await rpc<Connection[]>("connections/list").catch(() => []);
    const matches = connections.filter(
      (connection) =>
        connection.connectorId === item.connectorId && connection.provider === item.slug,
    );
    try {
      const row =
        matches.find((connection) => connection.status === "connected") ??
        matches.find((connection) => connection.status === "pending") ??
        matches.find((connection) => connection.status === "error");
      if (!row) throw new Error(`No connection record found for ${item.name}.`);
      await rpc("connections/revoke", { connectionId: row.id });
      await refresh();
    } catch (reason) {
      setCatalogError(reason instanceof Error ? reason.message : "Could not revoke connection");
    } finally {
      setPending(null);
    }
  }

  function beginSource(kind: SourceKind) {
    setSourceKind(kind);
    setSourceError(null);
    setName(kind === "treg" ? "Treg" : "");
    setUrl(kind === "treg" ? "https://treg.to/mcp/" : "");
    setCredential("");
    setRequiresAuth(kind === "treg");
  }

  async function addSource() {
    if (!sourceKind) return;
    setPending("source");
    setSourceError(null);
    try {
      await rpc("capabilities/install", {
        kind: sourceKind === "api" ? "api" : "mcp",
        name: name.trim() || (sourceKind === "treg" ? "Treg" : "Custom connector"),
        source: url.trim(),
        credential: credential.trim() || undefined,
        config:
          sourceKind === "treg"
            ? { preset: "treg", auth: { type: "bearer" } }
            : sourceKind === "api"
              ? { openApi: true, auth: { type: requiresAuth ? "bearer" : "none" } }
              : { preset: "custom", auth: { type: requiresAuth ? "bearer" : "none" } },
      });
      setCredential("");
      setSourceKind(null);
      await refresh();
    } catch (reason) {
      setSourceError(reason instanceof Error ? reason.message : "Could not add source");
    } finally {
      setPending(null);
    }
  }

  async function removeSource(source: CapabilityInstall) {
    setPending(source.id);
    setSourceError(null);
    try {
      await rpc("capabilities/remove", { id: source.id });
      setSources((current) => current.filter((item) => item.id !== source.id));
    } catch (reason) {
      setSourceError(reason instanceof Error ? reason.message : "Could not remove source");
    } finally {
      setPending(null);
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.explanation}>Connect apps.</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search plugins"
          placeholderTextColor={native.secondaryLabel}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search plugins"
          style={styles.input}
        />
        {chips.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {chips.map((id) => {
              const selected = filter === id;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setFilter(id)}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                >
                  <Text style={[styles.chipLabel, selected ? styles.chipLabelSelected : null]}>
                    {PLUGIN_FILTER_LABELS[id]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {catalogError ? <Text style={styles.error}>{catalogError}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.section}>Project key</Text>
          <Text style={styles.secondary}>
            {projectKey?.source === "user"
              ? "Saved for this account"
              : projectKey?.source === "server"
                ? "Using the server project key"
                : "Paste a Platform project key (ak_…), not a For You consumer key"}
          </Text>
          <TextInput
            value={projectKeyInput}
            onChangeText={setProjectKeyInput}
            placeholder={projectKey?.configured ? "Paste a replacement key" : "ak_…"}
            placeholderTextColor={native.secondaryLabel}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel="Composio project key"
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save project key"
              disabled={projectKeyBusy || projectKeyInput.trim().length < 8}
              onPress={() => void saveProjectKey()}
              style={styles.smallButton}
            >
              <Text style={styles.buttonLabel}>{projectKeyBusy ? "Saving…" : "Save"}</Text>
            </Pressable>
            {projectKey?.source === "user" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove project key"
                disabled={projectKeyBusy}
                onPress={() => void clearProjectKey()}
                style={styles.smallButton}
              >
                <Text style={styles.buttonLabel}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {!catalogReady ? <ActivityIndicator color={native.fillPressed} /> : null}

        {catalogReady && catalog.length === 0 ? (
          <Text style={styles.secondary}>{EMPTY_PLUGIN_CATALOG_MESSAGE}</Text>
        ) : null}

        {catalogReady && catalog.length > 0 ? (
          <View style={styles.catalogStack}>
            {showFeatured ? (
              <View testID="featured-connectors">
                <Text style={styles.section}>{PLUGIN_FILTER_LABELS.featured}</Text>
                <View style={catalogColumns === 2 ? styles.catalogGrid : styles.catalogStack}>
                  {featuredTiles.map((tile) => {
                    const item = tile.item;
                    const key = item ? `${item.connectorId}:${item.slug}` : tile.id;
                    const disabled = tile.missing || !item;
                    const connected = item?.connected ?? false;
                    const description = item
                      ? pluginDescriptionFor(item)
                      : tile.missing
                        ? "Not in the plugin catalog"
                        : "";
                    return (
                      <View
                        key={key}
                        style={[
                          styles.row,
                          catalogColumns === 2 ? styles.catalogCell : null,
                          disabled ? { opacity: 0.7 } : null,
                        ]}
                      >
                        <View style={styles.grow}>
                          <Text numberOfLines={1} style={styles.title}>
                            {tile.label}
                          </Text>
                          {description ? (
                            <Text numberOfLines={2} style={styles.secondary}>
                              {description}
                            </Text>
                          ) : null}
                        </View>
                        {disabled || !item ? null : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={
                              connected ? `Remove ${tile.label}` : `Add ${tile.label}`
                            }
                            disabled={pending === key}
                            onPress={() => void (connected ? revoke(item) : connect(item))}
                          >
                            <Text style={connected ? styles.added : styles.link}>
                              {pending === key ? "Working…" : connected ? "Added" : "Add"}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {showCategorySections
              ? sections.map((section) => (
                  <View key={section.id}>
                    <View style={styles.sectionRow}>
                      <Text style={styles.section}>{PLUGIN_FILTER_LABELS[section.id]}</Text>
                      {section.total > section.items.length ? (
                        <Pressable accessibilityRole="button" onPress={() => setFilter(section.id)}>
                          <Text style={styles.link}>View all</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={catalogColumns === 2 ? styles.catalogGrid : styles.catalogStack}>
                      {section.items.map((item) => {
                        const key = `${item.connectorId}:${item.slug}`;
                        return (
                          <View
                            key={key}
                            style={[styles.row, catalogColumns === 2 ? styles.catalogCell : null]}
                          >
                            <View style={styles.grow}>
                              <Text numberOfLines={1} style={styles.title}>
                                {item.name}
                              </Text>
                              {item.description ? (
                                <Text numberOfLines={2} style={styles.secondary}>
                                  {item.description}
                                </Text>
                              ) : null}
                            </View>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={
                                item.connected ? `Remove ${item.name}` : `Add ${item.name}`
                              }
                              disabled={pending === key}
                              onPress={() => void (item.connected ? revoke(item) : connect(item))}
                            >
                              <Text style={item.connected ? styles.added : styles.link}>
                                {pending === key ? "Working…" : item.connected ? "Added" : "Add"}
                              </Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))
              : null}
            {showFlatCatalog
              ? visibleEntries.map((item) => {
                  const key = `${item.connectorId}:${item.slug}`;
                  return (
                    <View
                      key={key}
                      style={[styles.row, catalogColumns === 2 ? styles.catalogCell : null]}
                    >
                      <View style={styles.grow}>
                        <Text numberOfLines={1} style={styles.title}>
                          {item.name}
                        </Text>
                        {item.description ? (
                          <Text numberOfLines={2} style={styles.secondary}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={
                          item.connected ? `Remove ${item.name}` : `Add ${item.name}`
                        }
                        disabled={pending === key}
                        onPress={() => void (item.connected ? revoke(item) : connect(item))}
                      >
                        <Text style={item.connected ? styles.added : styles.link}>
                          {pending === key ? "Working…" : item.connected ? "Added" : "Add"}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              : null}
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: advancedOpen }}
          testID="integrations-advanced"
          onPress={() => {
            if (advancedOpen) closeAdvanced();
            else setAdvancedOpen(true);
          }}
          style={styles.advancedToggle}
        >
          <Text style={styles.advancedLabel}>Advanced</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>

        {advancedOpen ? (
          <View style={styles.advancedBody}>
            <View style={styles.actions}>
              {(["mcp", "api", "treg"] as const).map((kind) => (
                <Pressable
                  key={kind}
                  accessibilityRole="button"
                  onPress={() => beginSource(kind)}
                  style={styles.smallButton}
                >
                  <Text style={styles.buttonLabel}>
                    {kind === "treg"
                      ? "Add Treg"
                      : kind === "mcp"
                        ? "Add MCP server"
                        : "Add OpenAPI"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {sourceError ? <Text style={styles.error}>{sourceError}</Text> : null}

            {sourceKind ? (
              <View style={styles.card}>
                <Text style={styles.title}>
                  {sourceKind === "treg"
                    ? "Connect Treg"
                    : sourceKind === "mcp"
                      ? "Remote MCP server"
                      : "OpenAPI JSON"}
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Display name"
                  placeholderTextColor={native.tertiaryLabel}
                  style={styles.input}
                />
                {sourceKind !== "treg" ? (
                  <TextInput
                    value={url}
                    onChangeText={setUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={
                      sourceKind === "mcp"
                        ? "https://example.com/mcp"
                        : "https://example.com/openapi.json"
                    }
                    placeholderTextColor={native.tertiaryLabel}
                    style={styles.input}
                  />
                ) : null}
                {sourceKind !== "treg" ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setRequiresAuth((value) => !value)}
                    style={styles.authToggle}
                  >
                    <Text style={styles.secondary}>
                      {requiresAuth ? "Bearer authentication" : "No authentication"}
                    </Text>
                  </Pressable>
                ) : null}
                {sourceKind === "treg" || requiresAuth ? (
                  <TextInput
                    value={credential}
                    onChangeText={setCredential}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={sourceKind === "treg" ? "Treg token" : "Bearer token"}
                    placeholderTextColor={native.tertiaryLabel}
                    style={styles.input}
                  />
                ) : null}
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={pending === "source"}
                    onPress={() => void addSource()}
                    style={styles.smallButton}
                  >
                    {pending === "source" ? (
                      <ActivityIndicator color={native.label} />
                    ) : (
                      <Text style={styles.buttonLabel}>Verify and add</Text>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSourceKind(null)}
                    style={styles.smallButton}
                  >
                    <Text style={styles.buttonLabel}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <Text style={styles.section}>Tool sources</Text>
            {sources.length === 0 ? (
              <Text style={styles.secondary}>No custom sources installed.</Text>
            ) : null}
            {sources.map((source) => (
              <View key={source.id} style={styles.row}>
                <View style={styles.grow}>
                  <Text style={styles.title}>{source.name}</Text>
                  <Text numberOfLines={1} style={styles.secondary}>
                    {source.kind.toUpperCase()} · {source.source}
                  </Text>
                </View>
                <Pressable accessibilityRole="button" onPress={() => void removeSource(source)}>
                  <Text style={styles.remove}>
                    {pending === source.id ? "Removing…" : "Remove"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: native.page },
  content: { padding: 20, gap: 14 },
  explanation: { color: native.secondaryLabel, fontSize: 14, lineHeight: 20 },
  section: { color: native.secondaryLabel, fontSize: 14, fontWeight: "600", marginTop: 10 },
  sectionRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chips: { gap: 8, paddingVertical: 4 },
  chip: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: native.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: { backgroundColor: native.label },
  chipLabel: { color: native.label, fontSize: 13, fontWeight: "600" },
  chipLabelSelected: { color: native.page },
  added: { color: "#30A24B", fontSize: 14, fontWeight: "600" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: native.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLabel: { color: native.label, fontSize: 14, fontWeight: "600" },
  card: { padding: 16, borderRadius: 16, backgroundColor: native.fill, gap: 12 },
  input: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: native.fillPressed,
    color: native.label,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  authToggle: { minHeight: 42, justifyContent: "center" },
  catalogGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catalogStack: { gap: 8 },
  catalogCell: { flexGrow: 1, flexBasis: "47%", maxWidth: "49%" },
  row: {
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: native.fill,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  grow: { flex: 1, gap: 3, minWidth: 0 },
  title: { color: native.label, fontSize: 15, fontWeight: "600" },
  secondary: { color: native.secondaryLabel, fontSize: 13 },
  link: { color: native.label, fontSize: 14, fontWeight: "600" },
  remove: { color: "#E96B6B", fontSize: 14, fontWeight: "600" },
  error: { color: "#E96B6B", fontSize: 14 },
  advancedToggle: {
    marginTop: 8,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  advancedLabel: { color: native.secondaryLabel, fontSize: 14 },
  advancedBody: { gap: 14 },
  chevron: { color: native.secondaryLabel, fontSize: 18 },
});
