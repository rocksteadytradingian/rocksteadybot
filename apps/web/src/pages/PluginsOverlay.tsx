import { Trans, useLingui } from "@lingui/react/macro";
import type {
  CapabilityInstall,
  ComposioProjectKeyStatus,
  ConnectionCatalogItem,
} from "@rakazo/contracts";
import {
  abortableDelay,
  buildFeaturedConnectorTiles,
  buildPluginSections,
  EMPTY_PLUGIN_CATALOG_MESSAGE,
  enrichPluginCatalogItem,
  type PluginCatalogEntry,
  type PluginMarketplaceFilter,
  pluginDescriptionFor,
  presentPluginCategories,
  selectPluginEntries,
} from "@rakazo/core";
import { Button } from "@rakazo/ui-web";
import { Check, Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { LoadingState } from "../components/beautiful-ui/primitives";
import { rpc } from "../lib/rpc";
import { ComposioProjectKeySettings } from "./ComposioProjectKeySettings";

type SourceKind = "treg" | "mcp" | "api";
type OverlayFilter = PluginMarketplaceFilter | "mcp";

function itemKey(item: Pick<ConnectionCatalogItem, "connectorId" | "slug">) {
  return `${item.connectorId}:${item.slug}`;
}

function markConnected(
  items: ConnectionCatalogItem[],
  connectorId: string,
  slug: string,
  connected: boolean,
) {
  return items.map((entry) =>
    entry.connectorId === connectorId && entry.slug === slug ? { ...entry, connected } : entry,
  );
}

function marketplaceChips(categories: PluginMarketplaceFilter[], hasMcp: boolean): OverlayFilter[] {
  const chips: OverlayFilter[] = [];
  for (const id of categories) {
    if (id === "installed") continue;
    chips.push(id);
    if (id === "infrastructure" && hasMcp) chips.push("mcp");
  }
  if (hasMcp && !chips.includes("mcp")) {
    const paymentsAt = chips.indexOf("payments");
    if (paymentsAt >= 0) chips.splice(paymentsAt, 0, "mcp");
    else chips.push("mcp");
  }
  return chips;
}

export function PluginsOverlay({
  onClose,
  onOpenMcp,
  activeBotId,
}: {
  onClose: () => void;
  onOpenMcp?: () => void;
  activeBotId?: string;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<OverlayFilter>("all");
  const [catalog, setCatalog] = useState<ConnectionCatalogItem[]>([]);
  const [sources, setSources] = useState<CapabilityInstall[]>([]);
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [credential, setCredential] = useState("");
  const [authType, setAuthType] = useState<"none" | "bearer" | "header">("bearer");
  const [authName, setAuthName] = useState("x-api-key");
  const [pending, setPending] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectKey, setProjectKey] = useState<ComposioProjectKeyStatus | null>(null);
  const connectionAttempt = useRef<AbortController | null>(null);

  function filterLabel(id: OverlayFilter): string {
    switch (id) {
      case "all":
        return t`All`;
      case "featured":
        return t`Featured`;
      case "installed":
        return t`Installed`;
      case "mcp":
        return t`MCP`;
      case "customer-support":
        return t`Customer Support`;
      case "data-analytics":
        return t`Data Analytics`;
      case "design":
        return t`Design`;
      case "documents-and-files":
        return t`Documents And Files`;
      case "finance-and-legal":
        return t`Finance And Legal`;
      case "inbox-and-collaboration":
        return t`Inbox And Collaboration`;
      case "infrastructure":
        return t`Infrastructure`;
      case "payments":
        return t`Payments`;
      case "productivity":
        return t`Productivity`;
      case "research":
        return t`Research`;
      case "sales":
        return t`Sales`;
      case "scheduling":
        return t`Scheduling`;
      case "more":
        return t`More`;
    }
  }

  async function refresh() {
    const [items, installs, keyStatus] = await Promise.all([
      rpc.connections.catalog({}),
      rpc.capabilities.list(),
      rpc.connections.projectKey(),
    ]);
    setCatalog(items);
    setSources(installs.filter((install) => install.kind === "mcp" || install.kind === "api"));
    setProjectKey(keyStatus);
    return items;
  }

  useEffect(() => {
    void refresh()
      .catch((err: unknown) =>
        setCatalogError(err instanceof Error ? err.message : t`Could not load plugins`),
      )
      .finally(() => setLoading(false));
    return () => connectionAttempt.current?.abort();
  }, []);

  const entries = useMemo(() => catalog.map(enrichPluginCatalogItem), [catalog]);
  const featuredTiles = useMemo(() => buildFeaturedConnectorTiles(catalog), [catalog]);
  const installed = useMemo(() => entries.filter((item) => item.connected), [entries]);
  const searching = query.trim().length > 0;
  const chips = useMemo(
    () => marketplaceChips(presentPluginCategories(entries), sources.length > 0),
    [entries, sources.length],
  );
  const catalogFilter: PluginMarketplaceFilter = filter === "mcp" ? "all" : filter;
  const sections = useMemo(
    () => (filter === "mcp" ? [] : buildPluginSections(entries, { filter: catalogFilter, query })),
    [catalogFilter, entries, filter, query],
  );
  const visibleEntries = useMemo(
    () => (filter === "mcp" ? [] : selectPluginEntries(entries, { filter: catalogFilter, query })),
    [catalogFilter, entries, filter, query],
  );
  const visibleSources = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scoped = sources.filter((source) => {
      if (!needle) return true;
      return (
        source.name.toLowerCase().includes(needle) ||
        source.source.toLowerCase().includes(needle) ||
        source.kind.toLowerCase().includes(needle)
      );
    });
    if (filter === "mcp" || filter === "installed" || (filter === "all" && !searching)) {
      return scoped;
    }
    return needle ? scoped : [];
  }, [filter, query, searching, sources]);
  const showFeatured =
    !searching && (filter === "all" || filter === "featured") && featuredTiles.length > 0;
  const showCategorySections = !searching && filter === "all";
  const showFlatCatalog =
    searching || (filter !== "all" && filter !== "featured" && filter !== "mcp");
  const showMcpSection =
    visibleSources.length > 0 &&
    (filter === "mcp" || filter === "installed" || (filter === "all" && !searching) || searching);
  const configuredKey = projectKey?.configured ?? false;

  async function notifyAppConnected(item: ConnectionCatalogItem) {
    if (!activeBotId) return;
    await rpc.onboarding
      .appConnected({ botId: activeBotId, provider: item.slug })
      .catch(() => undefined);
  }

  function setItemConnected(item: ConnectionCatalogItem, connected: boolean) {
    setCatalog((prev) => markConnected(prev, item.connectorId, item.slug, connected));
  }

  async function connect(item: ConnectionCatalogItem) {
    connectionAttempt.current?.abort();
    const controller = new AbortController();
    connectionAttempt.current = controller;
    setCatalogError(null);
    const key = itemKey(item);
    setPending(key);
    try {
      const started = await rpc.connections.begin({
        connectorId: item.connectorId,
        provider: item.slug,
        displayName: item.name,
      });
      if (started.authorizationUrl)
        window.open(started.authorizationUrl, "_blank", "noopener,noreferrer");
      if (item.noAuth && !started.authorizationUrl) {
        if (controller.signal.aborted) return;
        setItemConnected(item, true);
        void notifyAppConnected(item);
        return;
      }
      for (let i = 0; i < 45; i += 1) {
        if (controller.signal.aborted) return;
        const row = await rpc.connections
          .complete({ connectionId: started.connectionId })
          .catch(() => undefined);
        if (row?.status === "connected") {
          if (controller.signal.aborted) return;
          setItemConnected(item, true);
          void notifyAppConnected(item);
          return;
        }
        await abortableDelay(2_000, controller.signal);
      }
      if (controller.signal.aborted) return;
      setCatalogError(
        t`Connection to ${item.name} is still pending. You can close this and check again.`,
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      setCatalogError(err instanceof Error ? err.message : t`Could not connect`);
    } finally {
      if (connectionAttempt.current === controller) {
        connectionAttempt.current = null;
        setPending(null);
      }
    }
  }

  async function revoke(item: ConnectionCatalogItem) {
    setCatalogError(null);
    const key = itemKey(item);
    setPending(key);
    try {
      const rows = await rpc.connections.list();
      const matches = rows.filter(
        (entry) => entry.connectorId === item.connectorId && entry.provider === item.slug,
      );
      const row =
        matches.find((entry) => entry.status === "connected") ??
        matches.find((entry) => entry.status === "pending") ??
        matches.find((entry) => entry.status === "error");
      if (!row) throw new Error(t`No connection record found for ${item.name}.`);
      await rpc.connections.revoke({ connectionId: row.id });
      setItemConnected(item, false);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : t`Could not revoke connection`);
    } finally {
      setPending(null);
    }
  }

  function beginSource(kind: SourceKind) {
    setSourceKind(kind);
    setSourceError(null);
    setSourceName(kind === "treg" ? "Treg" : "");
    setSourceUrl(kind === "treg" ? "https://treg.to/mcp/" : "");
    setCredential("");
    setAuthType(kind === "treg" ? "bearer" : "none");
    setAuthName("x-api-key");
  }

  async function installSource() {
    if (!sourceKind) return;
    setSourceError(null);
    setPending("install-source");
    try {
      const auth = {
        type: authType,
        ...(authType === "header" ? { name: authName.trim() } : {}),
      };
      await rpc.capabilities.install({
        kind: sourceKind === "api" ? "api" : "mcp",
        name: sourceName.trim() || (sourceKind === "treg" ? "Treg" : "Custom connector"),
        source: sourceUrl.trim(),
        credential: credential.trim() || undefined,
        config:
          sourceKind === "treg"
            ? { preset: "treg", auth: { type: "bearer" } }
            : sourceKind === "api"
              ? { openApi: true, auth }
              : { preset: "custom", auth },
      });
      setCredential("");
      setSourceKind(null);
      await refresh();
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : t`Could not install connector`);
    } finally {
      setPending(null);
    }
  }

  async function removeSource(install: CapabilityInstall) {
    setPending(install.id);
    setSourceError(null);
    try {
      await rpc.capabilities.remove({ id: install.id });
      setSources((current) => current.filter((source) => source.id !== install.id));
    } catch (err) {
      setSourceError(err instanceof Error ? err.message : t`Could not remove connector`);
    } finally {
      setPending(null);
    }
  }

  const projectKeyCard = (
    <ComposioProjectKeySettings
      status={projectKey}
      onChange={(next) => {
        setProjectKey(next);
        void refresh().catch((err: unknown) =>
          setCatalogError(err instanceof Error ? err.message : t`Could not load plugins`),
        );
      }}
    />
  );

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[var(--rk-overlay)] p-4 sm:p-10">
      <div className="flex h-[min(760px,100%)] w-[1080px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[var(--rk-hairline)] bg-[var(--rk-surface)] shadow-[var(--rk-shadow)]">
        <div className="flex items-start justify-between px-6 pt-6 sm:px-8 sm:pt-7">
          <div>
            <div className="text-2xl font-medium text-[var(--rk-ink)]">
              <Trans>Plugins</Trans>
            </div>
            {!loading ? (
              <button
                type="button"
                onClick={() => setFilter("installed")}
                className="mt-2 flex items-center gap-2 text-[13.5px] text-[var(--rk-muted)]"
                aria-label={t`Installed plugins`}
              >
                {installed.length > 0 ? (
                  <span className="flex">
                    {installed.slice(0, 3).map((item, index) =>
                      item.logo ? (
                        <img
                          key={itemKey(item)}
                          src={item.logo}
                          alt=""
                          className="h-5 w-5 rounded-full bg-[var(--rk-surface-2)] object-contain ring-2 ring-[var(--rk-surface)]"
                          style={{ marginLeft: index === 0 ? 0 : -6 }}
                        />
                      ) : (
                        <span
                          key={itemKey(item)}
                          className="grid h-5 w-5 place-items-center rounded-full bg-[var(--rk-surface-2)] text-[10px] font-semibold text-[var(--rk-ink)] ring-2 ring-[var(--rk-surface)]"
                          style={{ marginLeft: index === 0 ? 0 : -6 }}
                        >
                          {item.name[0]}
                        </span>
                      ),
                    )}
                  </span>
                ) : null}
                <span>
                  {t`${installed.length} installed`}
                  {sources.length > 0 ? ` · ${t`${sources.length} private`}` : ""}
                </span>
                <span aria-hidden="true">›</span>
              </button>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={t`Close plugins`}
            onClick={onClose}
            className="text-[var(--rk-muted)]"
          >
            ✕
          </button>
        </div>

        <div className="px-6 pt-4 sm:px-8">
          <label className="relative block">
            <Search
              size={16}
              strokeWidth={1.8}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--rk-muted)]"
              aria-hidden
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={t`Search plugins`}
              placeholder={t`Search plugins`}
              className="w-full rounded-[13px] border border-[var(--rk-hairline)] bg-[var(--rk-input)] py-3 pl-10 pr-4 text-[15px] text-[var(--rk-ink)] outline-none"
            />
          </label>
          {!loading && chips.length > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {chips.map((id) => {
                const selected = filter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setFilter(id)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
                      selected
                        ? "bg-[var(--rk-solid)] text-[var(--rk-solid-ink)]"
                        : "border border-[var(--rk-hairline-strong)] text-[var(--rk-body)] hover:bg-[var(--rk-hover)]"
                    }`}
                  >
                    {filterLabel(id)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div id="integration-list" className="rk-scroll flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {catalogError ? (
            <p className="mb-4 text-sm text-[var(--rk-danger)]">{catalogError}</p>
          ) : null}
          {loading ? (
            <LoadingState label={t`Loading plugins`} />
          ) : (
            <>
              {!configuredKey ? projectKeyCard : null}

              {catalog.length === 0 && sources.length === 0 ? (
                <p className="text-[13.5px] leading-6 text-[var(--rk-muted-2)]">
                  {EMPTY_PLUGIN_CATALOG_MESSAGE}
                </p>
              ) : null}

              {showFeatured ? (
                <PluginSection
                  title={filterLabel("featured")}
                  testId="featured-connectors"
                  showViewAll={false}
                >
                  {featuredTiles.map((tile) => {
                    const item = tile.item;
                    const key = item ? itemKey(item) : tile.id;
                    const description = item
                      ? pluginDescriptionFor(item)
                      : tile.missing
                        ? t`Not in the plugin catalog`
                        : "";
                    return (
                      <PluginRow
                        key={key}
                        name={tile.label}
                        description={description}
                        logo={item?.logo ?? null}
                        connected={item?.connected ?? false}
                        pending={pending === key}
                        disabled={tile.missing || !item}
                        onToggle={
                          item && !tile.missing
                            ? () => void (item.connected ? revoke(item) : connect(item))
                            : undefined
                        }
                      />
                    );
                  })}
                </PluginSection>
              ) : null}

              {showCategorySections
                ? sections.map((section) => (
                    <PluginSection
                      key={section.id}
                      title={filterLabel(section.id)}
                      showViewAll={section.total > section.items.length}
                      onViewAll={() => setFilter(section.id)}
                    >
                      {section.items.map((item) => (
                        <CatalogPluginRow
                          key={itemKey(item)}
                          item={item}
                          pending={pending === itemKey(item)}
                          onToggle={() => void (item.connected ? revoke(item) : connect(item))}
                        />
                      ))}
                    </PluginSection>
                  ))
                : null}

              {showFlatCatalog && visibleEntries.length > 0 ? (
                <PluginSection
                  title={
                    searching
                      ? ""
                      : filter === "installed"
                        ? filterLabel("installed")
                        : filterLabel(catalogFilter)
                  }
                  showViewAll={false}
                >
                  {visibleEntries.map((item) => (
                    <CatalogPluginRow
                      key={itemKey(item)}
                      item={item}
                      pending={pending === itemKey(item)}
                      onToggle={() => void (item.connected ? revoke(item) : connect(item))}
                    />
                  ))}
                </PluginSection>
              ) : null}

              {!loading &&
              catalog.length > 0 &&
              visibleEntries.length === 0 &&
              searching &&
              visibleSources.length === 0 ? (
                <p className="text-[var(--rk-muted-2)]">
                  <Trans>No plugins match your search.</Trans>
                </p>
              ) : null}

              {showMcpSection ? (
                <PluginSection
                  title={filterLabel("mcp")}
                  showViewAll={filter === "all" && !searching && visibleSources.length > 4}
                  onViewAll={() => setFilter("mcp")}
                >
                  {(filter === "all" && !searching
                    ? visibleSources.slice(0, 4)
                    : visibleSources
                  ).map((source) => (
                    <PluginRow
                      key={source.id}
                      name={source.name}
                      description={`${source.kind.toUpperCase()} · ${source.source} · ${
                        source.secretConfigured ? t`credential saved` : t`no auth`
                      }`}
                      logo={null}
                      connected
                      pending={pending === source.id}
                      onToggle={() => void removeSource(source)}
                    />
                  ))}
                </PluginSection>
              ) : null}
            </>
          )}

          <details
            data-testid="integrations-advanced"
            className="group mt-8"
            onToggle={(event) => {
              if (!(event.currentTarget as HTMLDetailsElement).open) {
                setSourceKind(null);
                setSourceError(null);
                setSourceName("");
                setSourceUrl("");
                setCredential("");
                setAuthType("none");
                setAuthName("x-api-key");
              }
            }}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] text-[var(--rk-muted)]">
              <span>
                <Trans>Advanced</Trans>
              </span>
              <span aria-hidden="true" className="transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>

            <div className="mt-4 space-y-4">
              {configuredKey ? projectKeyCard : null}
              {onOpenMcp ? (
                <button
                  type="button"
                  onClick={onOpenMcp}
                  className="rounded-full border border-[var(--rk-hairline-strong)] px-3 py-1.5 text-xs text-[var(--rk-body)] hover:bg-[var(--rk-hover)]"
                >
                  <Trans>MCP servers</Trans>
                </button>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="pill" size="sm" onClick={() => beginSource("mcp")}>
                  <Trans>Add MCP server</Trans>
                </Button>
                <Button type="button" variant="pill" size="sm" onClick={() => beginSource("api")}>
                  <Trans>Add OpenAPI</Trans>
                </Button>
                <Button type="button" variant="pill" size="sm" onClick={() => beginSource("treg")}>
                  <Trans>Add Treg</Trans>
                </Button>
              </div>

              {sourceError ? (
                <p className="text-sm text-[var(--rk-danger)]">{sourceError}</p>
              ) : null}

              {sourceKind ? (
                <div className="space-y-3 rounded-[16px] border border-[var(--rk-hairline)] bg-[var(--rk-input)] p-5">
                  <div className="text-base font-medium text-[var(--rk-ink)]">
                    {sourceKind === "treg" ? (
                      <Trans>Connect Treg</Trans>
                    ) : sourceKind === "mcp" ? (
                      <Trans>Add remote MCP server</Trans>
                    ) : (
                      <Trans>Import OpenAPI JSON</Trans>
                    )}
                  </div>
                  <input
                    value={sourceName}
                    onChange={(event) => setSourceName(event.target.value)}
                    placeholder={t`Display name`}
                    className="w-full rounded-xl border border-[var(--rk-hairline)] bg-[var(--rk-surface)] px-3 py-2.5 text-sm text-[var(--rk-ink)] outline-none"
                  />
                  {sourceKind !== "treg" ? (
                    <input
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      placeholder={
                        sourceKind === "mcp"
                          ? "https://example.com/mcp"
                          : "https://example.com/openapi.json"
                      }
                      className="w-full rounded-xl border border-[var(--rk-hairline)] bg-[var(--rk-surface)] px-3 py-2.5 text-sm text-[var(--rk-ink)] outline-none"
                    />
                  ) : null}
                  {sourceKind !== "treg" ? (
                    <select
                      value={authType}
                      onChange={(event) => setAuthType(event.target.value as typeof authType)}
                      className="w-full rounded-xl border border-[var(--rk-hairline)] bg-[var(--rk-surface)] px-3 py-2.5 text-sm text-[var(--rk-ink)] outline-none"
                    >
                      <option value="none">
                        <Trans>No authentication</Trans>
                      </option>
                      <option value="bearer">
                        <Trans>Bearer token</Trans>
                      </option>
                      <option value="header">
                        <Trans>API key header</Trans>
                      </option>
                    </select>
                  ) : null}
                  {authType === "header" && sourceKind !== "treg" ? (
                    <input
                      value={authName}
                      onChange={(event) => setAuthName(event.target.value)}
                      placeholder={t`Header name`}
                      className="w-full rounded-xl border border-[var(--rk-hairline)] bg-[var(--rk-surface)] px-3 py-2.5 text-sm text-[var(--rk-ink)] outline-none"
                    />
                  ) : null}
                  {sourceKind === "treg" || authType !== "none" ? (
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={credential}
                      onChange={(event) => setCredential(event.target.value)}
                      placeholder={sourceKind === "treg" ? t`Treg token` : t`Credential`}
                      className="w-full rounded-xl border border-[var(--rk-hairline)] bg-[var(--rk-surface)] px-3 py-2.5 text-sm text-[var(--rk-ink)] outline-none"
                    />
                  ) : null}
                  <p className="text-xs leading-5 text-[var(--rk-muted-2)]">
                    <Trans>
                      RocksteadyBot verifies the source before saving it. Credentials are encrypted
                      and are never returned to clients or exposed to the model.
                    </Trans>
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="pill"
                      size="sm"
                      disabled={pending === "install-source"}
                      onClick={() => void installSource()}
                    >
                      {pending === "install-source" ? (
                        <Trans>Verifying…</Trans>
                      ) : (
                        <Trans>Verify and add</Trans>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="pill"
                      size="sm"
                      onClick={() => setSourceKind(null)}
                    >
                      <Trans>Cancel</Trans>
                    </Button>
                  </div>
                </div>
              ) : null}

              <div>
                <div className="mb-3 text-sm font-medium text-[var(--rk-muted)]">
                  <Trans>Tool sources</Trans>
                </div>
                {sources.length === 0 && !sourceKind ? (
                  <p className="text-[var(--rk-muted-2)]">
                    <Trans>No MCP or API tool sources installed yet.</Trans>
                  </p>
                ) : null}
                {sources.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-center gap-4 rounded-[13px] px-3 py-2.5"
                  >
                    <div className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-[var(--rk-surface-2)] font-semibold uppercase text-[var(--rk-ink)]">
                      {source.kind === "mcp" ? "M" : "A"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15.5px] font-medium text-[var(--rk-ink)]">
                        {source.name}
                      </div>
                      <div className="truncate text-[13.5px] text-[var(--rk-muted)]">
                        {source.kind.toUpperCase()} · {source.source} ·{" "}
                        {source.secretConfigured ? (
                          <Trans>credential saved</Trans>
                        ) : (
                          <Trans>no auth</Trans>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="pill"
                      size="sm"
                      disabled={pending === source.id}
                      onClick={() => void removeSource(source)}
                    >
                      {pending === source.id ? <Trans>Removing…</Trans> : <Trans>Remove</Trans>}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

function PluginSection({
  title,
  testId,
  showViewAll,
  onViewAll,
  children,
}: {
  title: string;
  testId?: string;
  showViewAll: boolean;
  onViewAll?: () => void;
  children: ReactNode;
}) {
  const { t } = useLingui();
  return (
    <section className="mb-7" data-testid={testId}>
      <div className="mb-2 flex items-center justify-between gap-3">
        {title ? (
          <h2 className="text-[13px] font-medium text-[var(--rk-muted)]">{title}</h2>
        ) : (
          <span />
        )}
        {showViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[13px] text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
          >
            {t`View all`}
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function CatalogPluginRow({
  item,
  pending,
  onToggle,
}: {
  item: PluginCatalogEntry;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <PluginRow
      name={item.name}
      description={item.description}
      logo={item.logo}
      connected={item.connected}
      pending={pending}
      onToggle={onToggle}
    />
  );
}

function PluginRow({
  name,
  description,
  logo,
  connected,
  pending,
  disabled,
  onToggle,
}: {
  name: string;
  description: string;
  logo: string | null;
  connected: boolean;
  pending: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  const { t } = useLingui();
  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-[13px] px-2.5 py-2 ${disabled ? "opacity-70" : ""}`}
    >
      {logo ? (
        <img
          src={logo}
          alt=""
          className="h-9 w-9 shrink-0 rounded-xl bg-[var(--rk-surface-2)] object-contain"
        />
      ) : (
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--rk-surface-2)] text-sm font-semibold text-[var(--rk-ink)]">
          {name[0]}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-[var(--rk-ink)]">{name}</div>
        {description ? (
          <div className="truncate text-[12.5px] text-[var(--rk-muted)]">{description}</div>
        ) : null}
      </div>
      {onToggle ? (
        <button
          type="button"
          aria-label={connected ? t`Remove ${name}` : t`Add ${name}`}
          disabled={pending || disabled}
          onClick={onToggle}
          className={
            connected
              ? "flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-[var(--rk-success)] disabled:opacity-60"
              : "shrink-0 rounded-full border border-[var(--rk-hairline-strong)] px-3 py-1 text-[13px] font-medium text-[var(--rk-ink)] hover:bg-[var(--rk-hover)] disabled:opacity-60"
          }
        >
          {pending ? (
            connected ? (
              <Trans>Removing…</Trans>
            ) : (
              <Trans>Adding…</Trans>
            )
          ) : connected ? (
            <>
              <Check size={14} strokeWidth={2.6} aria-hidden />
              <Trans>Added</Trans>
            </>
          ) : (
            <Trans>Add</Trans>
          )}
        </button>
      ) : null}
    </div>
  );
}
