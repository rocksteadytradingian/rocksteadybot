import { t } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { ChatMarkdown } from "@rakazo/chat-ui/web";
import type {
  AgentSkillCatalogEntry,
  Bot,
  BotSection,
  ComputerMode,
  ComputerReleaseReason,
  ComputerStatus,
  Connection,
  ConnectionCatalogItem,
  Group,
  Me,
  MessageBlock,
  ModelCatalogEntry,
  ModelCredential,
  PendingApproval,
  ProductEvent,
  Routine,
  SearchHit,
  TaughtSkill,
  ThinkingLevel,
  ThreadMessage,
  ThreadSnapshot,
  VoiceInfo,
  VoiceStatus,
  WorkspaceMemoryConfig,
} from "@rakazo/contracts";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  BOT_DESCRIPTION_MAX_LENGTH,
  BOT_NAME_MAX_LENGTH,
  BOT_TITLE_MAX_LENGTH,
  isAttachmentImageMimeType,
  normalizeCreateBotProfile,
} from "@rakazo/contracts";
import {
  abortableDelay,
  attachmentsForThread,
  buildComposerMentionOptions,
  type ComposerMention,
  cronFromPreset,
  defaultCronPreset,
  formatCron,
  groupBotsForSidebar,
  inferAttachmentMimeType,
  isActive,
  isApprovalAskBlock,
  isRunTerminalEvent,
  isWorking,
  latestAnswerableAskMessageId,
  mentionChipKey,
  presetFromCron,
  resolveComposerSendPlan,
  SLASH_ACTIONS,
  type SlashActionId,
  searchHitThreadTarget,
  serializeComposerPrompt,
  speechFromBlocks,
  truncateSlashDescription,
} from "@rakazo/core";
import {
  AvatarStyleProvider,
  BotAvatar,
  Button,
  GroupAvatar,
  type GroupAvatarMember,
} from "@rakazo/ui-web";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Box,
  ChevronLeft,
  Clock,
  Copy,
  Cpu,
  Gauge,
  LogOut,
  Maximize2,
  Menu,
  Mic,
  Minimize2,
  Monitor,
  Palette,
  Paperclip,
  Phone,
  Plus,
  Puzzle,
  Reply,
  Settings,
  Square,
  Volume2,
  X,
} from "lucide-react";
import {
  type ClipboardEvent,
  type DragEvent,
  lazy,
  type MutableRefObject,
  memo,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArtifactFileCard } from "../components/ArtifactFileCard";
import { AskCard } from "../components/AskCard";
import {
  ActiveBotGlyph,
  CollaborationMarker,
} from "../components/beautiful-ui/CollaborationMarker";
import { BuiButton, BuiCard, SuccessPop } from "../components/beautiful-ui/primitives";
import { ComputerMaintenanceActions } from "../components/ComputerMaintenanceActions";
import { SkillDraftCard } from "../components/teach/SkillDraftCard";
import { TeachCaptureOverlay } from "../components/teach/TeachCaptureOverlay";
import { TeachComputerSection } from "../components/teach/TeachComputerSection";
import { TeachRecordingChrome, TeachStopButton } from "../components/teach/TeachRecordingChrome";
import { UiThemePicker } from "../components/UiThemePicker";
import { readActivityMode, writeActivityMode } from "../lib/activity-mode";
import { type ArtifactTarget, decodeArtifactBase64 } from "../lib/artifact-open";
import { authClient } from "../lib/auth";
import { takeInitialBootstrap } from "../lib/bootstrap";
import { chartViewport } from "../lib/chart-viewport";
import { filesFromDataTransfer, namedClipboardFile } from "../lib/composer-attachments";
import { computerSidePanelBodyClass, computerSidePanelClass } from "../lib/computer-panel";
import { dictation } from "../lib/dictation";
import { isComputerBusyForThread, liveStatusForBot } from "../lib/live-bot-status";
import { localTimezone } from "../lib/local-timezone";
import { connectMcpOauth } from "../lib/mcp-connect";
import { revokePendingAttachmentPreviews } from "../lib/pending-attachments";
import { markAfterPaint, markOnce } from "../lib/performance";
import { rpc } from "../lib/rpc";
import {
  activeThreadRuns,
  clearActiveThreadRuns,
  computerPanelAutoBoot,
  computerPanelAutoUsesBoot,
  computerTakeoverBlocked,
  isComputerStatusEvent,
  isThreadSnapshotEvent,
  prependThreadMessagePage,
  reconcileRefreshedThread,
  reduceComputerStatus,
  reduceThreadSnapshot,
  userHoldsComputerControl,
} from "../lib/thread-events";
import { transcriptIsNearEnd } from "../lib/transcript-scroll";
import { speaker } from "../lib/tts";
import { resolveUiTheme, setUiTheme, uiThemeById } from "../lib/ui-theme";
import { ActivityList } from "./ActivityList";
import {
  ApprovalsNavButton,
  ApprovalsOverlay,
  ApprovalsPanelSection,
  usePendingApprovals,
} from "./ApprovalsInbox";
import type { ContextMenuPosition } from "./BotContextMenu";
import { CreateGroupForm, GroupSettings, memberName } from "./GroupPanel";
import { HostComputerPrompt } from "./HostComputerPrompt";
import { WindowChrome } from "./WindowChrome";
import { WorkspacePicker } from "./WorkspacePicker";
import { WorkspaceSearchResults } from "./WorkspaceSearch";

const BotContextMenu = lazy(() =>
  import("./BotContextMenu").then((module) => ({ default: module.BotContextMenu })),
);
const AccountSettingsOverlay = lazy(() =>
  import("./AccountSettingsOverlay").then((module) => ({
    default: module.AccountSettingsOverlay,
  })),
);
const ModelSettingsOverlay = lazy(() =>
  import("./ModelSettingsOverlay").then((module) => ({ default: module.ModelSettingsOverlay })),
);
const PeerMessagesOverlay = lazy(() =>
  import("./PeerMessagesOverlay").then((module) => ({ default: module.PeerMessagesOverlay })),
);
const PluginsOverlay = lazy(() =>
  import("./PluginsOverlay").then((module) => ({ default: module.PluginsOverlay })),
);
const McpServersOverlay = lazy(() =>
  import("./McpServersOverlay").then((module) => ({ default: module.McpServersOverlay })),
);
const MemorySettingsOverlay = lazy(() =>
  import("./MemorySettingsOverlay").then((module) => ({
    default: module.MemorySettingsOverlay,
  })),
);
const RoutineSchedules = lazy(() =>
  import("./RoutineSchedule").then((module) => ({ default: module.RoutineSchedules })),
);
const VoiceSettingsOverlay = lazy(() =>
  import("./VoiceSettingsOverlay").then((module) => ({ default: module.VoiceSettingsOverlay })),
);
const CallView = lazy(() => import("./CallView").then((module) => ({ default: module.CallView })));
const ScratchpadSection = lazy(() =>
  import("./ScratchpadSection").then((module) => ({ default: module.ScratchpadSection })),
);

type Panel =
  | "computer"
  | "settings"
  | "routine"
  | "create"
  | "create-group"
  | "group-settings"
  | null;

type PendingAttachment = {
  id: string;
  threadKey: string;
  file: File;
  previewUrl?: string;
};

export function ShellPage() {
  const { t } = useLingui();
  const { botId, groupId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Mirrors searchParams for effects that only need to read it once on run,
  // not re-run on every unrelated query-param change (e.g. the SSE subscribe
  // effect below, which should only restart when the active bot changes).
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const session = authClient.useSession();
  const [groups, setGroups] = useState<Group[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [botSections, setBotSections] = useState<BotSection[]>([]);
  const [archivedBots, setArchivedBots] = useState<Bot[]>([]);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<ThreadSnapshot | null>(null);
  const snapshotRef = useRef<ThreadSnapshot | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [replyTarget, setReplyTarget] = useState<ThreadMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [peerMessagesOpen, setPeerMessagesOpen] = useState(false);
  const [peerMessagesFocusId, setPeerMessagesFocusId] = useState<string | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routinesBotId, setRoutinesBotId] = useState<string | null>(null);
  const [taughtSkills, setTaughtSkills] = useState<TaughtSkill[]>([]);
  const [taughtSkillsBotId, setTaughtSkillsBotId] = useState<string | null>(null);
  const [agentSkills, setAgentSkills] = useState<AgentSkillCatalogEntry[]>([]);
  const [mentionRoutines, setMentionRoutines] = useState<Array<Routine & { botName?: string }>>([]);
  const [mentionConnectors, setMentionConnectors] = useState<
    Array<{
      id: string;
      name: string;
      authStatus: "connected" | "needs_auth";
      connectionId?: string;
    }>
  >([]);
  const [teachBusy, setTeachBusy] = useState(false);
  const [computer, setComputer] = useState<ComputerStatus | null>(null);
  const computerRef = useRef<ComputerStatus | null>(null);
  const threadRefreshEpoch = useRef(0);
  const groupRefreshEpoch = useRef(0);
  // Last-known computer/screen per bot, so switching back to an already-seen
  // bot paints its computer pane instantly instead of blanking it while the
  // thread + screen RPCs round-trip again (see refreshThread / refreshComputerScreen).
  const computerCacheRef = useRef(
    new Map<string, { computer: ComputerStatus | null; screenUrl: string | null }>(),
  );
  // Caps computerCacheRef so a long session that opens many distinct bots
  // over time doesn't accumulate one entry per bot forever. Re-inserting on
  // every update keeps Map iteration order as least-recently-used first, so
  // eviction drops the bot that's been out of view longest.
  const COMPUTER_CACHE_LIMIT = 20;

  function cacheComputerFor(
    botId: string,
    patch: Partial<{ computer: ComputerStatus | null; screenUrl: string | null }>,
  ) {
    const cache = computerCacheRef.current;
    const prev = cache.get(botId) ?? { computer: null, screenUrl: null };
    cache.delete(botId);
    cache.set(botId, { ...prev, ...patch });
    if (cache.size > COMPUTER_CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
  }

  function commitSnapshot(next: ThreadSnapshot | null) {
    snapshotRef.current = next;
    setSnapshot(next);
  }

  function commitComputer(next: ComputerStatus | null) {
    computerRef.current = next;
    setComputer(next);
  }

  function updateSnapshot(update: (prev: ThreadSnapshot | null) => ThreadSnapshot | null) {
    commitSnapshot(update(snapshotRef.current));
  }
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [accountSettingsFocusUsage, setAccountSettingsFocusUsage] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [memorySettingsOpen, setMemorySettingsOpen] = useState(false);
  const [memoryProviderConfig, setMemoryProviderConfig] = useState<
    WorkspaceMemoryConfig | null | undefined
  >(undefined);
  const memoryProviderConfigRevision = useRef(0);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [uiTheme, setUiThemeId] = useState(resolveUiTheme);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [activityMode, setActivityMode] = useState(readActivityMode);
  const toggleActivityMode = useCallback(() => {
    setActivityMode((on) => {
      const next = !on;
      writeActivityMode(next);
      return next;
    });
  }, []);
  const [botMenu, setBotMenu] = useState<{
    botId: string;
    position: ContextMenuPosition;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bot | null>(null);
  const [clearTarget, setClearTarget] = useState<Bot | null>(null);
  const [newSectionBot, setNewSectionBot] = useState<Bot | null>(null);
  const [booting, setBooting] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [initialBotsLoaded, setInitialBotsLoaded] = useState(false);
  const [bootstrapMe, setBootstrapMe] = useState<Me | null>();
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [routineDraft, setRoutineDraft] = useState({
    name: "",
    prompt: "",
    schedules: [defaultCronPreset()],
  });
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [deleteRoutineTarget, setDeleteRoutineTarget] = useState<Routine | null>(null);
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [runningRoutine, setRunningRoutine] = useState(false);
  const [routineError, setRoutineError] = useState<string | null>(null);
  const [screenUrl, setScreenUrl] = useState<string | null>(null);
  const [computerOpen, setComputerOpen] = useState(false);
  const [computerEnlarged, setComputerEnlarged] = useState(false);
  const [computerFullscreen, setComputerFullscreen] = useState(false);
  const computerOverlayRef = useRef<HTMLDivElement>(null);
  const [computerError, setComputerError] = useState<string | null>(null);
  const [computerSwitching, setComputerSwitching] = useState(false);
  const [usage, setUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    runs: number;
  } | null>(null);
  const autoBooted = useRef<string | null>(null);
  const routineSavePending = useRef(false);
  const routineSaveRequest = useRef(0);
  const routineRunPending = useRef(false);
  const bootstrappedThread = useRef<ThreadSnapshot | null>(null);
  const expandedHistoryThread = useRef<string | null>(null);
  const historyEpoch = useRef(0);
  const jumpGeneration = useRef(0);
  const initiallyScrolledThread = useRef<string | null>(null);
  const messageScroll = useRef<HTMLDivElement>(null);
  const pinnedAroundRef = useRef<{
    botId?: string;
    groupId?: string;
    messageId: string;
    threadId: string;
    messages: ThreadMessage[];
    olderCursor: number | null;
  } | null>(null);
  const manuallyUnread = useRef(new Set<string>());
  const readVisibleGroups = useRef(new Set<string>());
  const computerVisible = useRef(false);
  computerVisible.current = panel === "computer" || computerOpen;
  const autoSpoken = useRef<string | null>(null);
  const autoSpokenBotId = useRef<string | null>(null);

  const inGroup = Boolean(groupId);
  const active = inGroup ? undefined : (bots.find((b) => b.id === botId) ?? bots[0]);
  const activeGroup = groups.find((group) => group.id === groupId);
  const activePendingAttachments = useMemo(
    () => attachmentsForThread(pendingAttachments, inGroup ? groupId : active?.id),
    [active?.id, groupId, inGroup, pendingAttachments],
  );
  const activeRoutines = !inGroup && routinesBotId === active?.id ? routines : [];
  const activeTaughtSkills = taughtSkillsBotId === active?.id ? taughtSkills : [];
  const recordingSkill = activeTaughtSkills.find((skill) => skill.status === "recording") ?? null;
  const routeBotId = useRef<string | undefined>(botId);
  routeBotId.current = botId;
  const routeGroupId = useRef<string | undefined>(groupId);
  routeGroupId.current = groupId;
  const activeBotId = useRef<string | undefined>(inGroup ? undefined : active?.id);
  activeBotId.current = inGroup ? undefined : active?.id;
  const activeGroupId = useRef<string | undefined>(groupId);
  activeGroupId.current = groupId;
  const screenRequest = useRef(0);
  const contextBot = botMenu ? bots.find((bot) => bot.id === botMenu.botId) : undefined;
  const closeBotMenu = useCallback(() => setBotMenu(null), []);
  const updateBotUnread = useCallback((id: string, unread: boolean) => {
    setBots((current) => {
      const bot = current.find((candidate) => candidate.id === id);
      if (!bot || bot.unread === unread) return current;
      return current.map((candidate) =>
        candidate.id === id ? { ...candidate, unread } : candidate,
      );
    });
  }, []);
  const markBotRead = useCallback(
    async (id: string) => {
      await rpc.threads.markRead({ botId: id });
      manuallyUnread.current.delete(id);
      updateBotUnread(id, false);
    },
    [updateBotUnread],
  );
  const markBotUnread = useCallback(
    async (id: string) => {
      manuallyUnread.current.add(id);
      try {
        await rpc.threads.markUnread({ botId: id });
      } catch (err) {
        manuallyUnread.current.delete(id);
        throw err;
      }
      updateBotUnread(id, true);
    },
    [updateBotUnread],
  );
  // A bot the user marked unread by hand stays unread until they open it again,
  // otherwise the auto-read below would undo the action on the next window focus.
  const markBotReadIfVisible = useCallback(
    (id: string) => {
      if (manuallyUnread.current.has(id)) return;
      if (document.visibilityState === "visible" && document.hasFocus()) {
        void markBotRead(id).catch(() => undefined);
      }
    },
    [markBotRead],
  );

  const refreshBots = useCallback(
    async (includeArchived = false) => {
      markOnce("rk:renderer:bots-request-start");
      const [list, sections, archived, groupList] = await Promise.all([
        rpc.bots.list(),
        rpc.botSections.list(),
        includeArchived ? rpc.bots.listArchived() : Promise.resolve(null),
        rpc.groups.list(),
      ]);
      markOnce("rk:renderer:bots-response");
      setBots(list);
      setBotSections(sections);
      setGroups(groupList);
      setInitialBotsLoaded(true);
      if (archived) setArchivedBots(archived);
      if (
        includeArchived &&
        list.length === 0 &&
        archived?.length === 0 &&
        groupList.length === 0
      ) {
        navigate("/onboarding", { replace: true });
        return;
      }
      const currentGroupId = routeGroupId.current;
      if (currentGroupId) {
        if (!groupList.some((group) => group.id === currentGroupId)) {
          navigate(firstThreadRoute(list, groupList), { replace: true });
        }
        return;
      }
      const currentBotId = routeBotId.current;
      if (!currentBotId || !list.some((bot) => bot.id === currentBotId)) {
        navigate(firstThreadRoute(list, groupList), { replace: true });
      }
    },
    [navigate],
  );

  async function changeWorkspace(run: () => Promise<Me>) {
    if (workspaceBusy) return;
    setWorkspaceBusy(true);
    try {
      const nextMe = await run();
      setBootstrapMe(nextMe);
      const [list, sections, archived, groupList] = await Promise.all([
        rpc.bots.list(),
        rpc.botSections.list(),
        rpc.bots.listArchived(),
        rpc.groups.list(),
      ]);
      setBots(list);
      setBotSections(sections);
      setArchivedBots(archived);
      setGroups(groupList);
      setInitialBotsLoaded(true);
      commitSnapshot(null);
      commitComputer(null);
      setRoutines([]);
      setRoutinesBotId(null);
      setScreenUrl(null);
      setComputerOpen(false);
      navigate(firstThreadRoute(list, groupList), { replace: true });
    } finally {
      setWorkspaceBusy(false);
    }
  }

  async function refreshGroupThread(id: string) {
    const scrollElement = messageScroll.current;
    const stickToEnd = !scrollElement || transcriptIsNearEnd(scrollElement);
    markOnce("rk:renderer:thread-request-start");
    const request = ++groupRefreshEpoch.current;
    const snap = await rpc.threads.get({ groupId: id });
    markOnce("rk:renderer:thread-response");
    if (activeGroupId.current !== id || request !== groupRefreshEpoch.current) return snap;
    const reconciled = reconcileRefreshedThread(
      snapshotRef.current,
      snap,
      computerRef.current,
      expandedHistoryThread.current === snap.threadId,
    );
    commitSnapshot(reconciled.snapshot);
    commitComputer(null);
    setRoutines([]);
    setRoutinesBotId(null);
    // Keep the search-jump viewport; expandedHistoryThread merge still accepts live messages.
    if (
      stickToEnd &&
      (!scrollElement || transcriptIsNearEnd(scrollElement)) &&
      expandedHistoryThread.current !== snap.threadId
    ) {
      window.requestAnimationFrame(() => {
        const element = messageScroll.current;
        if (element) element.scrollTop = element.scrollHeight;
      });
    }
    return snap;
  }

  async function refreshThread(id: string) {
    const scrollElement = messageScroll.current;
    const stickToEnd = !scrollElement || transcriptIsNearEnd(scrollElement);
    markOnce("rk:renderer:thread-request-start");
    const epoch = historyEpoch.current;
    const request = ++threadRefreshEpoch.current;
    // Apply threads.get as soon as it returns so stop/takeover status is not held behind
    // routines/skills/screen fetches (progress can advance the cursor meanwhile).
    const snap = await rpc.threads.get({ botId: id });
    markOnce("rk:renderer:thread-response");
    if (
      activeBotId.current !== id ||
      epoch !== historyEpoch.current ||
      request !== threadRefreshEpoch.current
    ) {
      return snap;
    }
    const reconciled = reconcileRefreshedThread(
      snapshotRef.current,
      snap,
      computerRef.current,
      expandedHistoryThread.current === snap.threadId,
    );
    commitSnapshot(reconciled.snapshot);
    commitComputer(reconciled.computer);
    cacheComputerFor(id, { computer: reconciled.computer });
    if (
      stickToEnd &&
      (!scrollElement || transcriptIsNearEnd(scrollElement)) &&
      expandedHistoryThread.current !== snap.threadId
    ) {
      window.requestAnimationFrame(() => {
        const element = messageScroll.current;
        if (element) element.scrollTop = element.scrollHeight;
      });
    }
    const [routines, skills] = await Promise.all([
      rpc.routines.list({ botId: id }),
      rpc.skills.list({ botId: id }),
      refreshComputerScreen(id),
    ]);
    if (
      activeBotId.current !== id ||
      epoch !== historyEpoch.current ||
      request !== threadRefreshEpoch.current
    ) {
      return snap;
    }
    setRoutines(routines);
    setRoutinesBotId(id);
    setTaughtSkills(skills);
    setTaughtSkillsBotId(id);
    return snap;
  }

  async function refreshComputerScreen(id: string) {
    if (!computerVisible.current) return null;
    const request = ++screenRequest.current;
    const screen = await rpc.computer.screenUrl({ botId: id }).catch(() => ({ url: null }));
    if (
      request !== screenRequest.current ||
      activeBotId.current !== id ||
      !computerVisible.current
    ) {
      return null;
    }
    setScreenUrl(screen.url);
    cacheComputerFor(id, { screenUrl: screen.url });
    return screen.url;
  }

  async function loadOlderMessages() {
    const targetBotId = inGroup ? undefined : active?.id;
    const targetGroupId = inGroup ? groupId : undefined;
    const snapshotMatchesTarget = targetGroupId
      ? snapshot?.groupId === targetGroupId
      : snapshot?.botId === targetBotId;
    if (
      (!targetBotId && !targetGroupId) ||
      !snapshotMatchesTarget ||
      snapshot?.olderCursor == null ||
      loadingOlder
    )
      return;
    pinnedAroundRef.current = null;
    const scrollElement = messageScroll.current;
    const previousHeight = scrollElement?.scrollHeight ?? 0;
    const epoch = historyEpoch.current;
    const before = snapshot.olderCursor;
    setLoadingOlder(true);
    try {
      const page = await rpc.threads.messages({
        ...(targetGroupId ? { groupId: targetGroupId } : { botId: targetBotId! }),
        before,
      });
      if (
        epoch !== historyEpoch.current ||
        activeBotId.current !== targetBotId ||
        activeGroupId.current !== targetGroupId
      )
        return;
      expandedHistoryThread.current = page.threadId;
      updateSnapshot((prev) => prependThreadMessagePage(prev, page));
      window.requestAnimationFrame(() => {
        const element = messageScroll.current;
        if (element) element.scrollTop += element.scrollHeight - previousHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const providerConfigRevision = memoryProviderConfigRevision.current;
    void rpc.memory
      .providerConfig()
      .then((providerConfig) => {
        if (!cancelled && memoryProviderConfigRevision.current === providerConfigRevision) {
          setMemoryProviderConfig(providerConfig);
        }
      })
      .catch(() => {
        if (!cancelled && memoryProviderConfigRevision.current === providerConfigRevision) {
          setMemoryProviderConfig(null);
        }
      });
    void Promise.all([takeInitialBootstrap(botId), rpc.groups.list()])
      .then(([bootstrap, groupList]) => {
        if (cancelled) return;
        setBootstrapMe(bootstrap.me);
        setBots(bootstrap.bots);
        setBotSections(bootstrap.botSections);
        setArchivedBots(bootstrap.archivedBots);
        setGroups(groupList);
        setInitialBotsLoaded(true);
        if (!groupId && bootstrap.thread) {
          bootstrappedThread.current = bootstrap.thread;
          commitSnapshot(bootstrap.thread);
          commitComputer(bootstrap.thread.computer ?? null);
          setRoutines(bootstrap.routines);
          setRoutinesBotId(bootstrap.thread.botId ?? null);
          markOnce("rk:renderer:bots-response");
          markOnce("rk:renderer:thread-response");
        }
        if (bootstrap.bots.length === 0 && bootstrap.archivedBots.length === 0) {
          navigate("/onboarding", { replace: true });
          return;
        }
        if (groupId) {
          if (!groupList.some((group) => group.id === groupId)) {
            navigate(firstThreadRoute(bootstrap.bots, groupList), { replace: true });
          }
          return;
        }
        const selectedBotId = bootstrap.thread?.botId ?? bootstrap.bots[0]?.id;
        if (selectedBotId && selectedBotId !== botId) {
          navigate(`/app/${selectedBotId}`, { replace: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setBootstrapMe(null);
        void refreshBots(true);
      });
    let refreshTimer: number | undefined;
    const refreshVisibleBots = () => {
      if (document.visibilityState !== "visible") return;
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => void refreshBots().catch(() => undefined), 50);
    };
    window.addEventListener("focus", refreshVisibleBots);
    document.addEventListener("visibilitychange", refreshVisibleBots);
    const poll = window.setInterval(refreshVisibleBots, 60_000);
    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshVisibleBots);
      document.removeEventListener("visibilitychange", refreshVisibleBots);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void rpc.agentSkills
      .list()
      .then((skills) => {
        if (!cancelled) setAgentSkills(skills);
      })
      .catch(() => {
        if (!cancelled) setAgentSkills([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshAgentSkills = useCallback(() => {
    void rpc.agentSkills
      .list()
      .then(setAgentSkills)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void rpc.voice
      .status()
      .then(setVoiceStatus)
      .catch(() => undefined);
    const unsubSpeech = speaker.subscribe((state) => {
      setSpeakingMessageId(state.status === "idle" ? null : (state.messageId ?? null));
    });
    const unsubDictation = dictation.subscribe((state) => {
      setDictating(state.status === "listening" || state.status === "transcribing");
      if (state.error) setDictationError(state.error);
      else if (state.status === "listening") setDictationError(null);
    });
    return () => {
      unsubSpeech();
      unsubDictation();
    };
  }, []);

  useEffect(() => {
    if (!active || !snapshot || snapshot.botId !== active.id) return;
    const lastBot = [...snapshot.messages].reverse().find((message) => message.role === "bot");
    if (autoSpokenBotId.current !== active.id) {
      autoSpokenBotId.current = active.id;
      autoSpoken.current = lastBot?.id ?? null;
      return;
    }
    if (callOpen || !active.autoSpeak) {
      autoSpoken.current = lastBot?.id ?? null;
      return;
    }
    if (snapshot.run && isWorking(snapshot.run.status)) return;
    if (!lastBot || lastBot.id === autoSpoken.current) return;
    const text = speechFromBlocks(lastBot.blocks);
    if (!text) return;
    autoSpoken.current = lastBot.id;
    void speaker.speak(text, { botId: active.id, messageId: lastBot.id });
  }, [
    snapshot?.messages,
    snapshot?.run?.status,
    snapshot?.botId,
    active?.autoSpeak,
    active?.id,
    callOpen,
  ]);

  useEffect(() => {
    if (!active) return;
    // Opening a bot clears the manual unread flag so it can auto-read again.
    manuallyUnread.current.delete(active.id);
    const markVisibleBotRead = () => {
      markBotReadIfVisible(active.id);
    };
    markVisibleBotRead();
    window.addEventListener("focus", markVisibleBotRead);
    document.addEventListener("visibilitychange", markVisibleBotRead);
    return () => {
      window.removeEventListener("focus", markVisibleBotRead);
      document.removeEventListener("visibilitychange", markVisibleBotRead);
    };
  }, [active?.id, markBotReadIfVisible]);

  useEffect(() => {
    if (!active) return;
    const pendingJump = searchParamsRef.current.get("m");
    if (!pendingJump) {
      pinnedAroundRef.current = null;
    }
    screenRequest.current += 1;
    const cached = computerCacheRef.current.get(active.id);
    if (cached) {
      // Paint the last-known computer instantly; refreshThread/refreshComputerScreen
      // below still run and reconcile with fresh data in the background.
      setScreenUrl(cached.screenUrl);
      commitComputer(cached.computer);
    } else {
      setScreenUrl(null);
    }
    expandedHistoryThread.current = null;
    historyEpoch.current += 1;
    const abort = new AbortController();
    void (async () => {
      const primed = bootstrappedThread.current;
      bootstrappedThread.current = null;
      // Pending search jumps load the around-page separately; avoid replacing it with latest.
      const snap =
        primed?.botId === active.id
          ? primed
          : pendingJump
            ? await rpc.threads.get({ botId: active.id }).catch(() => null)
            : await refreshThread(active.id).catch(() => null);
      if (abort.signal.aborted) return;
      let cursor = snap?.cursor ?? -1;
      let retryMs = 250;
      while (!abort.signal.aborted) {
        try {
          const events = await rpc.threads.subscribe(
            { botId: active.id, cursor },
            { signal: abort.signal },
          );
          for await (const event of events) {
            if (abort.signal.aborted) break;
            cursor = Math.max(cursor, event.seq);
            retryMs = 250;
            applyThreadEvent(event, commitSnapshot, commitComputer, snapshotRef, computerRef);
            if (event.type === "thread.cleared") {
              expandedHistoryThread.current = null;
              pinnedAroundRef.current = null;
              historyEpoch.current += 1;
            }
            if (event.type === "bot.archived") {
              void refreshBots(true).catch(() => undefined);
            } else if (
              event.type === "bot.spawned" ||
              event.type === "bot.deleted" ||
              isRunTerminalEvent(event) ||
              event.type === "thread.cleared"
            ) {
              void refreshBots().catch(() => undefined);
            }
            if (event.type === "thread.message.created") {
              const blocks = (event.payload.blocks as Array<{ kind?: string }>) ?? [];
              if (blocks.some((block) => block.kind === "child_bot")) {
                void refreshBots().catch(() => undefined);
              }
              if (event.payload.role === "bot") markBotReadIfVisible(active.id);
            }
            if (
              isRunTerminalEvent(event) ||
              event.type === "run.waiting_input" ||
              event.type === "skill.teaching.stopped"
            ) {
              // waiting_input: reconcile ask cards if a stale post-send refresh raced SSE.
              void refreshThread(active.id).catch(() => undefined);
            } else if (isComputerStatusEvent(event)) {
              void refreshComputerScreen(active.id).catch(() => undefined);
            }
          }
        } catch {
          // The durable cursor below makes reconnects safe after a transient network failure.
        }
        if (abort.signal.aborted) break;
        await refreshThread(active.id).catch(() => null);
        await abortableDelay(retryMs, abort.signal);
        retryMs = Math.min(retryMs * 2, 5_000);
      }
    })();
    return () => {
      abort.abort();
    };
  }, [active?.id, markBotReadIfVisible]);

  useEffect(() => {
    if (!groupId || !activeGroup) return;
    manuallyUnread.current.delete(activeGroup.id);
    readVisibleGroups.current.delete(groupId);
    const markVisibleGroupRead = () => {
      if (
        document.visibilityState !== "visible" ||
        !document.hasFocus() ||
        readVisibleGroups.current.has(groupId)
      )
        return;
      readVisibleGroups.current.add(groupId);
      void rpc.threads
        .markRead({ groupId })
        .then(() => {
          setGroups((current) => {
            const group = current.find((candidate) => candidate.id === groupId);
            if (!group?.unread) return current;
            return current.map((candidate) =>
              candidate.id === groupId ? { ...candidate, unread: false } : candidate,
            );
          });
        })
        .catch(() => {
          readVisibleGroups.current.delete(groupId);
        });
    };
    markVisibleGroupRead();
    window.addEventListener("focus", markVisibleGroupRead);
    document.addEventListener("visibilitychange", markVisibleGroupRead);
    const pendingJump = searchParamsRef.current.get("m");
    if (!pendingJump) {
      pinnedAroundRef.current = null;
      expandedHistoryThread.current = null;
    }
    historyEpoch.current += 1;
    const abort = new AbortController();
    void (async () => {
      const snap = pendingJump
        ? await rpc.threads.get({ groupId }).catch(() => null)
        : await refreshGroupThread(groupId).catch(() => null);
      if (abort.signal.aborted) return;
      let cursor = snap?.cursor ?? -1;
      let retryMs = 250;
      while (!abort.signal.aborted) {
        try {
          const events = await rpc.threads.subscribe({ groupId, cursor }, { signal: abort.signal });
          for await (const event of events) {
            if (abort.signal.aborted) break;
            cursor = Math.max(cursor, event.seq);
            retryMs = 250;
            applyThreadEvent(event, commitSnapshot, commitComputer, snapshotRef, computerRef);
            if (event.type === "thread.message.created" && event.payload.role === "bot") {
              readVisibleGroups.current.delete(groupId);
              markVisibleGroupRead();
            }
            if (isRunTerminalEvent(event) || event.type === "run.waiting_input") {
              // waiting_input: reconcile ask cards if a stale post-send refresh raced SSE.
              void refreshGroupThread(groupId).catch(() => undefined);
            }
          }
        } catch {
          // reconnect safely
        }
        if (abort.signal.aborted) break;
        await refreshGroupThread(groupId).catch(() => null);
        await abortableDelay(retryMs, abort.signal);
        retryMs = Math.min(retryMs * 2, 5_000);
      }
    })();
    return () => {
      window.removeEventListener("focus", markVisibleGroupRead);
      document.removeEventListener("visibilitychange", markVisibleGroupRead);
      abort.abort();
    };
  }, [activeGroup?.id, groupId]);

  const filtered = useMemo(
    () => bots.filter((b) => `${b.name} ${b.preview}`.toLowerCase().includes(query.toLowerCase())),
    [bots, query],
  );
  const sidebarGroups = useMemo(
    () => groupBotsForSidebar<Bot>(filtered, botSections),
    [botSections, filtered],
  );
  const workspaceQuery = query.trim();
  const showWorkspaceSearch = workspaceQuery.length > 0;

  useEffect(() => {
    if (!showWorkspaceSearch) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      void rpc.search
        .query({ q: workspaceQuery })
        .then((result) => {
          if (!abort.signal.aborted) setSearchHits(result.hits);
        })
        .catch(() => {
          if (!abort.signal.aborted) setSearchHits([]);
        })
        .finally(() => {
          if (!abort.signal.aborted) setSearchLoading(false);
        });
    }, 200);
    return () => {
      abort.abort();
      window.clearTimeout(timer);
    };
  }, [showWorkspaceSearch, workspaceQuery]);

  async function jumpToSearchHit(hit: SearchHit) {
    setQuery("");
    setSearchHits([]);
    const params = new URLSearchParams();
    if (hit.messageId) params.set("m", hit.messageId);
    if (hit.routineId) params.set("routine", hit.routineId);
    navigate({
      pathname: hit.groupId ? `/app/g/${hit.groupId}` : `/app/${hit.botId}`,
      search: params.toString() ? `?${params.toString()}` : undefined,
    });
  }

  async function jumpToMessage(target: { botId?: string; groupId?: string; messageId: string }) {
    const threadTarget = searchHitThreadTarget(target);
    const epoch = historyEpoch.current;
    jumpGeneration.current += 1;
    const jumpId = jumpGeneration.current;
    const [snap, page] = await Promise.all([
      rpc.threads.get(threadTarget),
      rpc.threads.messages({ ...threadTarget, around: { messageId: target.messageId } }),
    ]);
    // The epoch check drops a jump that raced a conversation clear (or a bot switch): applying
    // the fetched page would pin deleted messages that every later refresh keeps restoring.
    // jumpId drops an older jump that finished after a newer click.
    if (epoch !== historyEpoch.current || jumpId !== jumpGeneration.current) return;
    if (target.groupId && activeGroupId.current !== target.groupId) return;
    if (target.botId && activeBotId.current !== target.botId) return;
    expandedHistoryThread.current = page.threadId;
    pinnedAroundRef.current = {
      ...threadTarget,
      messageId: target.messageId,
      threadId: page.threadId,
      messages: page.messages,
      olderCursor: page.olderCursor,
    };
    initiallyScrolledThread.current = page.threadId;
    commitSnapshot({
      ...snap,
      messages: page.messages,
      olderCursor: page.olderCursor,
    });
    if (threadTarget.botId) {
      commitComputer(snap.computer ?? null);
      // Don't block parent-scroll on routines metadata; a list failure must not abort the jump.
      void rpc.routines
        .list({ botId: threadTarget.botId })
        .then((routines) => {
          if (epoch !== historyEpoch.current || jumpId !== jumpGeneration.current) return;
          if (activeBotId.current !== threadTarget.botId) return;
          setRoutines(routines);
          setRoutinesBotId(threadTarget.botId);
        })
        .catch(() => undefined);
    } else {
      commitComputer(null);
      setRoutines([]);
      setRoutinesBotId(null);
    }
    window.requestAnimationFrame(() => {
      if (epoch !== historyEpoch.current || jumpId !== jumpGeneration.current) return;
      document
        .querySelector(`[data-message-id="${target.messageId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  useEffect(() => {
    const messageId = searchParams.get("m");
    const routineId = searchParams.get("routine");
    if (inGroup && groupId && messageId) {
      void jumpToMessage({ groupId, messageId }).finally(() => {
        // Keep expandedHistoryThread; only strip the jump URL so refresh does not remount.
        const next = new URLSearchParams(searchParams);
        next.delete("m");
        setSearchParams(next, { replace: true });
      });
      return;
    }
    if (!active) return;
    if (routineId && routinesBotId === active.id) {
      const routine = routines.find((item) => item.id === routineId);
      if (routine) {
        setRoutineDraft({
          name: routine.name,
          prompt: routine.prompt,
          schedules: routine.crons.map(presetFromCron),
        });
        setEditingRoutine(routine);
        setPanel("routine");
      } else {
        setPanel("computer");
      }
      const next = new URLSearchParams(searchParams);
      next.delete("routine");
      setSearchParams(next, { replace: true });
    }
    if (messageId) {
      void jumpToMessage({ botId: active.id, messageId }).finally(() => {
        const next = new URLSearchParams(searchParams);
        next.delete("m");
        setSearchParams(next, { replace: true });
      });
    }
  }, [active?.id, groupId, inGroup, routines, routinesBotId, searchParams, setSearchParams]);
  const activeSnapshot = inGroup
    ? snapshot?.groupId === groupId
      ? snapshot
      : null
    : snapshot?.botId === active?.id
      ? snapshot
      : null;
  const activeReplyTarget =
    replyTarget && activeSnapshot?.messages.some((message) => message.id === replyTarget.id)
      ? replyTarget
      : null;
  const currentRuns = activeThreadRuns(activeSnapshot);
  const answerableAskMessageId = latestAnswerableAskMessageId(activeSnapshot);
  const workingRuns = currentRuns.filter((run) => isWorking(run.status));
  const computerBusyForThread = isComputerBusyForThread({
    controlHolder: computer?.controlHolder,
    busyBotName: computer?.busyBotName,
    threadBotName: inGroup ? null : (active?.name ?? null),
    memberNames: (activeSnapshot?.members ?? activeGroup?.members)?.map((member) => member.name),
  });
  const transcriptRunning = workingRuns.length > 0 || computerBusyForThread;
  const liveStatusByBotId = new Map<string, string>();
  for (const bot of bots) {
    const status = liveStatusForBot({
      botId: bot.id,
      botName: bot.name,
      listedStatus: bot.status,
      runs: currentRuns,
      activeBotId: active?.id,
      busyBotName: computer?.busyBotName,
      controlHolder: computer?.controlHolder,
    });
    if (status !== bot.status) liveStatusByBotId.set(bot.id, status);
  }
  const workingStartedAtMs = (() => {
    let earliest: number | undefined;
    for (const run of workingRuns) {
      // Prefer startedAt; fall back to createdAt so queued/leased runs keep a
      // stable clock across remounts before the executor sets startedAt.
      const iso = run.startedAt ?? run.createdAt;
      const ms = Date.parse(iso);
      if (Number.isNaN(ms)) continue;
      if (earliest === undefined || ms < earliest) earliest = ms;
    }
    return earliest;
  })();
  const composerRunning = currentRuns.some((run) => isActive(run.status));
  const transcriptArtifactTarget = useMemo<ArtifactTarget>(
    () => (inGroup ? { groupId: groupId ?? "" } : { botId: active?.id ?? "" }),
    [active?.id, groupId, inGroup],
  );
  const pendingApprovalHint = useMemo(() => {
    let count = 0;
    for (const message of snapshot?.messages ?? []) {
      for (const block of message.blocks) {
        if (block.kind === "ask" && isApprovalAskBlock(block) && block.status !== "answered") {
          count += 1;
        }
      }
    }
    return count;
  }, [snapshot?.messages]);
  const {
    items: pendingApprovals,
    loading: approvalsLoading,
    refresh: refreshApprovals,
    setItems: setPendingApprovals,
  } = usePendingApprovals(pendingApprovalHint);
  const botApprovals = useMemo(
    () =>
      pendingApprovals.filter((item) =>
        inGroup ? item.groupId === groupId : item.botId === active?.id && !item.groupId,
      ),
    [active?.id, groupId, inGroup, pendingApprovals],
  );
  const transcriptMembers = activeSnapshot?.members ?? activeGroup?.members;
  const resolveTranscriptBot = useCallback(
    (botId: string) => {
      const bot = bots.find((candidate) => candidate.id === botId);
      if (bot) return bot;
      return transcriptMembers?.find((member) => member.botId === botId);
    },
    [bots, transcriptMembers],
  );
  const workingBots: GroupAvatarMember[] = workingRuns.map((run) => {
    const bot = resolveTranscriptBot(run.botId);
    return {
      botId: run.botId,
      color: bot?.color ?? "var(--rk-muted)",
      name: bot?.name,
      status: run.status,
    };
  });
  if (workingBots.length === 0 && computerBusyForThread && computer?.busyBotName) {
    const busyMember = (activeSnapshot?.members ?? activeGroup?.members)?.find(
      (member) => member.name === computer.busyBotName,
    );
    const busyBot = busyMember ?? bots.find((bot) => bot.name === computer.busyBotName);
    if (busyBot) {
      workingBots.push({
        botId: "botId" in busyBot ? busyBot.botId : busyBot.id,
        color: busyBot.color,
        name: busyBot.name,
        status: "running",
      });
    }
  }
  const resolveTranscriptMemberName = useCallback(
    (botId: string | undefined) => memberName(transcriptMembers, botId),
    [transcriptMembers],
  );
  const replyTargetName = activeReplyTarget
    ? activeReplyTarget.role === "user"
      ? t`You`
      : (resolveTranscriptMemberName(activeReplyTarget.botId) ?? active?.name ?? t`Bot`)
    : undefined;
  const composerMentionTargets = useMemo(
    () =>
      buildComposerMentionOptions({
        query: "",
        includeEveryone: inGroup,
        currentGroupId: groupId,
        bots: bots.map((bot) => ({ id: bot.id, name: bot.name, color: bot.color })),
        groups: groups.map((group) => ({ id: group.id, name: group.name })),
        routines: mentionRoutines.map((routine) => ({
          id: routine.id,
          name: routine.name,
          crons: routine.crons,
          botId: routine.botId,
          botName: routine.botName,
        })),
        connectors: mentionConnectors,
      }),
    [bots, groupId, groups, inGroup, mentionConnectors, mentionRoutines],
  );
  const shellReady =
    initialBotsLoaded &&
    (inGroup
      ? Boolean(activeGroup && activeSnapshot)
      : bots.length === 0 || Boolean(active && activeSnapshot));
  const refreshThreadRef = useRef(refreshThread);
  refreshThreadRef.current = refreshThread;
  const refreshGroupThreadRef = useRef(refreshGroupThread);
  refreshGroupThreadRef.current = refreshGroupThread;
  const loadOlderMessagesRef = useRef(loadOlderMessages);
  loadOlderMessagesRef.current = loadOlderMessages;
  const jumpToMessageRef = useRef(jumpToMessage);
  jumpToMessageRef.current = jumpToMessage;

  const mentionBotsKey = useMemo(
    () => bots.map((bot) => `${bot.id}:${bot.name}`).join(","),
    [bots],
  );
  const botsForMentionsRef = useRef(bots);
  botsForMentionsRef.current = bots;

  useEffect(() => {
    const bots = botsForMentionsRef.current;
    if (!initialBotsLoaded || bots.length === 0) {
      setMentionRoutines([]);
      setMentionConnectors([]);
      return;
    }
    let cancelled = false;
    const botNameById = new Map(bots.map((bot) => [bot.id, bot.name]));
    void Promise.all(
      bots.map((bot) =>
        rpc.routines
          .list({ botId: bot.id })
          .then((rows) =>
            rows.map((routine) => ({
              ...routine,
              botName: botNameById.get(bot.id) ?? bot.name,
            })),
          )
          .catch(() => [] as Array<Routine & { botName?: string }>),
      ),
    ).then((lists) => {
      if (!cancelled) setMentionRoutines(lists.flat());
    });
    void Promise.all([
      rpc.connections.list().catch(() => [] as Connection[]),
      rpc.connections.catalog({}).catch(() => [] as ConnectionCatalogItem[]),
    ]).then(([connections, catalog]) => {
      if (cancelled) return;
      const connected = connections.filter((row) => row.status === "connected");
      const options: Array<{
        id: string;
        name: string;
        authStatus: "connected" | "needs_auth";
        connectionId?: string;
      }> = connected.map((row) => ({
        id: row.id,
        name: row.displayName,
        authStatus: "connected" as const,
        connectionId: row.id,
      }));
      for (const item of catalog) {
        if (item.connected || item.noAuth) continue;
        if (
          connected.some(
            (row) =>
              row.provider.toLowerCase() === item.slug.toLowerCase() ||
              row.displayName.toLowerCase() === item.name.toLowerCase(),
          )
        ) {
          continue;
        }
        options.push({
          id: `catalog:${item.connectorId}:${item.slug}`,
          name: item.name,
          authStatus: "needs_auth",
        });
      }
      setMentionConnectors(options);
    });
    return () => {
      cancelled = true;
    };
  }, [initialBotsLoaded, mentionBotsKey]);

  useLayoutEffect(() => {
    if (initialBotsLoaded) {
      markOnce("rk:renderer:bots-committed");
      markAfterPaint("rk:renderer:bots-painted");
    }
    if (active && snapshot?.botId === active.id) {
      markOnce("rk:renderer:thread-committed");
      markAfterPaint("rk:renderer:thread-painted");
    }
    if (shellReady) {
      markOnce("rk:renderer:shell-ready");
      markAfterPaint("rk:renderer:shell-painted");
    }
  }, [active, initialBotsLoaded, shellReady, snapshot?.botId]);

  useLayoutEffect(() => {
    const pin = pinnedAroundRef.current;
    if (inGroup) {
      if (!groupId || !snapshot || snapshot.groupId !== groupId) return;
      if (initiallyScrolledThread.current === snapshot.threadId) return;
      if (expandedHistoryThread.current === snapshot.threadId) return;
      if (pin?.groupId === groupId) return;
    } else {
      if (!active || !snapshot || snapshot.botId !== active.id) return;
      if (initiallyScrolledThread.current === snapshot.threadId) return;
      if (expandedHistoryThread.current === snapshot.threadId) return;
      if (pin?.botId === active.id) return;
    }
    const element = messageScroll.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    initiallyScrolledThread.current = snapshot.threadId;
  }, [active, groupId, inGroup, snapshot?.botId, snapshot?.groupId, snapshot?.threadId]);

  const openBot = useCallback((id: string) => navigate(`/app/${id}`), [navigate]);
  const loadOlder = useCallback(() => loadOlderMessagesRef.current(), []);
  const jumpToReplyMessage = useCallback((messageId: string) => {
    const existing = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    if (existing) {
      // Cancel any in-flight around-fetch so it cannot overwrite this scroll.
      jumpGeneration.current += 1;
      existing.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const groupId = activeGroupId.current;
    if (groupId) {
      void jumpToMessageRef.current({ groupId, messageId });
      return;
    }
    const botId = activeBotId.current;
    if (botId) void jumpToMessageRef.current({ botId, messageId });
  }, []);
  const answerMessage = useCallback(async (message: ThreadMessage, text: string) => {
    const botId = activeBotId.current;
    const groupId = activeGroupId.current;
    if (!botId && !groupId) return;
    await rpc.threads.answer({
      ...(groupId ? { groupId } : { botId: botId! }),
      runId: message.runId ?? "",
      messageId: message.id,
      answer: text,
    });
    if (groupId && activeGroupId.current === groupId) {
      await refreshGroupThreadRef.current(groupId);
    } else if (botId && activeBotId.current === botId) {
      await refreshThreadRef.current(botId);
    }
  }, []);
  const openApproval = useCallback(
    (item: PendingApproval) => {
      setApprovalsOpen(false);
      setMobileSidebarOpen(false);
      const params = new URLSearchParams();
      params.set("m", item.messageId);
      navigate({
        pathname: item.groupId ? `/app/g/${item.groupId}` : `/app/${item.botId}`,
        search: `?${params}`,
      });
    },
    [navigate],
  );
  const answerApproval = useCallback(
    async (item: PendingApproval) => {
      setApprovalBusyId(item.id);
      try {
        await rpc.threads.answer({
          ...(item.groupId ? { groupId: item.groupId } : { botId: item.botId }),
          runId: item.runId,
          messageId: item.messageId,
          answer: "allow",
        });
        setPendingApprovals((current) => current.filter((row) => row.id !== item.id));
        if (item.groupId && activeGroupId.current === item.groupId) {
          await refreshGroupThreadRef.current(item.groupId);
        } else if (!item.groupId && activeBotId.current === item.botId) {
          await refreshThreadRef.current(item.botId);
        }
      } catch {
        await refreshApprovals();
      } finally {
        setApprovalBusyId(null);
      }
    },
    [refreshApprovals, setPendingApprovals],
  );
  const onAttachmentPick = useCallback(
    async (files: ArrayLike<File> | null) => {
      const threadKey = activeGroupId.current ?? activeBotId.current;
      if (!threadKey || !files?.length) return;
      const existing = attachmentsForThread(pendingAttachments, threadKey);
      const next: PendingAttachment[] = [];
      const skipped: string[] = [];
      for (const file of Array.from(files)) {
        const named = namedClipboardFile(file);
        if (existing.length + next.length >= ATTACHMENT_MAX_COUNT) {
          skipped.push(t`${named.name} (max ${ATTACHMENT_MAX_COUNT} attachments)`);
          continue;
        }
        if (named.size > ATTACHMENT_MAX_BYTES) {
          skipped.push(t`${named.name} (over 10 MiB)`);
          continue;
        }
        const mimeType = inferAttachmentMimeType(named.name, named.type);
        if (!mimeType) {
          skipped.push(named.name);
          continue;
        }
        next.push({
          id: `${named.name}-${named.size}-${named.lastModified}-${next.length}`,
          threadKey,
          file: named,
          previewUrl: isAttachmentImageMimeType(mimeType) ? URL.createObjectURL(named) : undefined,
        });
      }
      if (next.length) setPendingAttachments((current) => [...current, ...next]);
      setAttachmentNotice(skipped.length ? t`Skipped ${skipped.join(", ")}` : null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [pendingAttachments, t],
  );
  const removeAttachment = useCallback((attachment: PendingAttachment) => {
    revokePendingAttachmentPreviews([attachment]);
    setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id));
  }, []);
  const sendMessage = useCallback(
    async (text: string, mentions: ComposerMention[] = []) => {
      const initialBotTarget = activeBotId.current;
      const initialGroupTarget = activeGroupId.current;
      if ((!initialBotTarget && !initialGroupTarget) || sending) return;
      const originThreadKey = initialGroupTarget ?? initialBotTarget;
      const attachments = attachmentsForThread(pendingAttachments, originThreadKey);
      const plan = resolveComposerSendPlan({
        text,
        mentions,
        hasAttachments: attachments.length > 0,
      });
      if (plan.isNoOp) return;
      const reroutedToGroup = Boolean(
        plan.rerouteGroupId && plan.rerouteGroupId !== initialGroupTarget,
      );
      const groupTarget = plan.rerouteGroupId ?? initialGroupTarget;
      const botTarget = reroutedToGroup ? undefined : initialBotTarget;
      const trimmed = plan.trimmed;
      setSending(true);
      setSendError(null);
      try {
        if (plan.shouldRunRoutines) {
          const sendNonce = crypto.randomUUID();
          await Promise.all(
            plan.routineIds.map((routineId) =>
              rpc.routines.testRun({
                routineId,
                clientNonce: `routine-mention:${sendNonce}:${routineId}`,
              }),
            ),
          );
        }
        if (!plan.shouldSend) {
          setReplyTarget(null);
          revokePendingAttachmentPreviews(attachments);
          setPendingAttachments((current) =>
            current.filter((attachment) => attachment.threadKey !== originThreadKey),
          );
          setAttachmentNotice(null);
          if (reroutedToGroup && groupTarget) {
            navigate(`/app/g/${groupTarget}`);
            return;
          }
          if (groupTarget && activeGroupId.current === groupTarget) {
            await refreshGroupThreadRef.current(groupTarget);
          } else if (botTarget && activeBotId.current === botTarget) {
            await refreshThreadRef.current(botTarget);
          }
          return;
        }
        const artifactIds: string[] = [];
        for (const pending of attachments) {
          const mimeType = inferAttachmentMimeType(pending.file.name, pending.file.type);
          if (!mimeType) {
            throw new Error(t`Unsupported file type: ${pending.file.name}`);
          }
          const contentBase64 = await readFileAsBase64(pending.file);
          const artifact = await rpc.artifacts.create(
            groupTarget
              ? { groupId: groupTarget, name: pending.file.name, mimeType, contentBase64 }
              : { botId: botTarget!, name: pending.file.name, mimeType, contentBase64 },
          );
          artifactIds.push(artifact.id);
        }
        if (groupTarget) {
          await rpc.threads.send({
            groupId: groupTarget,
            text: trimmed || undefined,
            mentions: plan.mentionPayload.length ? plan.mentionPayload : undefined,
            artifactIds: artifactIds.length ? artifactIds : undefined,
            replyToMessageId: reroutedToGroup ? undefined : activeReplyTarget?.id,
          });
        } else if (botTarget) {
          await rpc.threads.send({
            botId: botTarget,
            text: trimmed || undefined,
            mentions: plan.mentionPayload.length ? plan.mentionPayload : undefined,
            artifactIds: artifactIds.length ? artifactIds : undefined,
            replyToMessageId: activeReplyTarget?.id,
          });
        }
        setReplyTarget(null);
        revokePendingAttachmentPreviews(attachments);
        setPendingAttachments((current) =>
          current.filter((attachment) => attachment.threadKey !== originThreadKey),
        );
        if (reroutedToGroup && groupTarget) {
          navigate(`/app/g/${groupTarget}`);
          return;
        }
        if (groupTarget && activeGroupId.current === groupTarget) setAttachmentNotice(null);
        if (botTarget && activeBotId.current === botTarget) setAttachmentNotice(null);
        if (groupTarget) await refreshGroupThreadRef.current(groupTarget);
        else if (botTarget) await refreshThreadRef.current(botTarget);
      } catch (error) {
        if (reroutedToGroup && groupTarget) {
          setSendError(error instanceof Error ? error.message : t`Failed to send message`);
        } else if (groupTarget && activeGroupId.current === groupTarget) {
          setSendError(error instanceof Error ? error.message : t`Failed to send message`);
        } else if (botTarget && activeBotId.current === botTarget) {
          setSendError(error instanceof Error ? error.message : t`Failed to send message`);
        }
      } finally {
        setSending(false);
      }
    },
    [activeReplyTarget?.id, navigate, pendingAttachments, sending, t],
  );
  const followUpMessage = useCallback(async (text: string) => {
    const id = activeBotId.current;
    if (!id) return;
    await rpc.threads.followUp({ botId: id, text });
    await refreshThreadRef.current(id);
  }, []);
  const stopRun = useCallback(async () => {
    const botTarget = activeBotId.current;
    const groupTarget = activeGroupId.current;
    if (groupTarget) {
      setSendError(null);
      try {
        await rpc.threads.stop({ groupId: groupTarget });
      } catch (error) {
        if (activeGroupId.current === groupTarget) {
          setSendError(error instanceof Error ? error.message : t`Failed to stop`);
        }
        return;
      }
      // Stop has no terminal event; clear run UI before refresh races with in-flight gets.
      if (activeGroupId.current === groupTarget) {
        updateSnapshot((prev) =>
          prev && prev.groupId === groupTarget ? clearActiveThreadRuns(prev) : prev,
        );
      }
      await refreshGroupThreadRef.current(groupTarget).catch(() => undefined);
      return;
    }
    if (!botTarget) return;
    setSendError(null);
    try {
      await rpc.threads.stop({ botId: botTarget });
    } catch (error) {
      if (activeBotId.current === botTarget) {
        setSendError(error instanceof Error ? error.message : t`Failed to stop`);
      }
      return;
    }
    // Stop does not emit a terminal thread event. Clear local run/busy immediately so a
    // superseded in-flight refresh (older cursor) cannot leave Stop enabled / Take control
    // blocked while the API is already idle.
    if (activeBotId.current === botTarget) {
      updateSnapshot((prev) => {
        if (!prev || (prev.botId !== botTarget && prev.botId)) return prev;
        return clearActiveThreadRuns(prev);
      });
      const currentComputer = computerRef.current;
      if (currentComputer?.busyBotName) {
        commitComputer({ ...currentComputer, busyBotName: null });
      }
    }
    await refreshThreadRef.current(botTarget).catch(() => undefined);
  }, [t]);
  const stopTeaching = useCallback(async () => {
    const id = activeBotId.current;
    if (!id || teachBusy) return;
    const recording = taughtSkills.find(
      (skill) => skill.status === "recording" && taughtSkillsBotId === id,
    );
    if (!recording) return;
    setTeachBusy(true);
    try {
      await rpc.skills.stop({ skillId: recording.id });
      await refreshThreadRef.current(id);
      setComputerOpen(false);
    } finally {
      setTeachBusy(false);
    }
  }, [teachBusy, taughtSkills, taughtSkillsBotId]);
  // Transcript and MessageView are memoized; these must stay referentially stable or every
  // Shell state change re-renders the whole transcript.
  const refreshActiveThread = useCallback(async () => {
    const groupId = activeGroupId.current;
    if (groupId) {
      await refreshGroupThreadRef.current(groupId);
      return;
    }
    const id = activeBotId.current;
    if (!id) return;
    await refreshThreadRef.current(id);
  }, []);
  const addSkillRoutine = useCallback((name: string, prompt: string) => {
    setRoutineDraft({ name, prompt, schedules: [defaultCronPreset()] });
    setEditingRoutine(null);
    setPanel("routine");
  }, []);
  const speakingMessageIdRef = useRef(speakingMessageId);
  speakingMessageIdRef.current = speakingMessageId;
  const speakMessage = useCallback((message: ThreadMessage) => {
    if (speakingMessageIdRef.current === message.id) {
      speaker.stop();
      return;
    }
    const text = speechFromBlocks(message.blocks);
    const id = message.botId ?? activeBotId.current;
    if (text && id) void speaker.speak(text, { botId: id, messageId: message.id });
  }, []);

  async function createGroup(input: { name: string; botIds: string[] }) {
    const group = await rpc.groups.create(input);
    setGroups((current) =>
      current.some((item) => item.id === group.id) ? current : [group, ...current],
    );
    navigate(`/app/g/${group.id}`);
    setPanel(null);
    await refreshBots().catch(() => undefined);
  }

  async function createBot(input: {
    name: string;
    title: string;
    description: string;
    computerMode: ComputerMode;
  }) {
    const bot = await rpc.bots.create({
      ...normalizeCreateBotProfile(input),
      notifyOnFinish: true,
      computerMode: input.computerMode,
    });
    setBots((current) =>
      current.some((item) => item.id === bot.id) ? current : [bot, ...current],
    );
    navigate(`/app/${bot.id}`);
    setPanel(null);
    await refreshBots().catch(() => undefined);
  }

  async function bootComputer({
    takeControl,
    overlay,
    force = false,
  }: {
    takeControl: boolean;
    overlay: boolean;
    force?: boolean;
  }) {
    if (!active) return;
    const needsBoot = force || computer?.state !== "running" || !screenUrl;
    if (overlay && needsBoot) setBooting(true);
    try {
      if (needsBoot) await rpc.computer.boot({ botId: active.id });
      if (takeControl) await rpc.computer.takeover({ botId: active.id });
      await refreshThread(active.id);
      setComputerError(null);
    } catch (error) {
      setComputerError(error instanceof Error ? error.message : t`Could not take control`);
      throw error;
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    if (panel !== "computer") {
      autoBooted.current = null;
      return;
    }
    if (!active) return;
    const botId = active.id;
    let cancelled = false;
    void (async () => {
      // Refresh from the server first. A stale SSE "booting" snapshot used to
      // skip this effect, so an RPC takeover never showed "You have control".
      const snap = await refreshThread(botId).catch(() => null);
      if (cancelled || activeBotId.current !== botId) return;
      const state = snap?.computer?.state;
      const screen = state === "running" ? await refreshComputerScreen(botId) : null;
      if (cancelled || activeBotId.current !== botId) return;
      const action = computerPanelAutoBoot(state, screen);
      if (action === "wait") {
        if (state === "running") autoBooted.current = botId;
        return;
      }
      if (action === "boot" && autoBooted.current === botId) return;
      autoBooted.current = botId;
      if (!computerPanelAutoUsesBoot(action)) return;
      await bootComputer({
        takeControl: false,
        overlay: action === "boot",
        force: true,
      }).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [panel, active?.id]);

  useEffect(() => {
    function onFullscreenChange() {
      setComputerFullscreen(document.fullscreenElement === computerOverlayRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    setComputerOpen(false);
    setComputerEnlarged(false);
    setComputerError(null);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, [active?.id]);

  useEffect(() => {
    if (!computer?.busyBotName) setComputerError(null);
  }, [computer?.busyBotName]);

  useEffect(() => {
    if (panel !== "routine") {
      routineSaveRequest.current += 1;
      setRoutineError(null);
    }
  }, [panel]);

  // The routine panel copies a routine's data into local draft state at click time
  // rather than deriving it from `active`, so it goes stale across a bot switch —
  // without this, Save on bot B could silently update bot A's routine.
  useEffect(() => {
    setEditingRoutine(null);
    setDeleteRoutineTarget(null);
    setPanel((current) => (current === "routine" ? null : current));
  }, [active?.id]);

  useEffect(() => {
    const threadKey = inGroup ? groupId : active?.id;
    setPendingAttachments((current) => {
      const stale = current.filter((attachment) => attachment.threadKey !== threadKey);
      revokePendingAttachmentPreviews(stale);
      return attachmentsForThread(current, threadKey);
    });
    setReplyTarget(null);
    setAttachmentNotice(null);
    setSendError(null);
  }, [active?.id, groupId, inGroup]);

  useEffect(() => {
    if (!computerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.fullscreenElement) return;
      setComputerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [computerOpen]);

  useEffect(() => {
    if ((panel !== "computer" && !computerOpen) || !active || computer?.state !== "running") return;
    const ping = () => void rpc.computer.heartbeat({ botId: active.id }).catch(() => undefined);
    ping();
    const timer = window.setInterval(ping, 60_000);
    return () => window.clearInterval(timer);
  }, [panel, computerOpen, active?.id, computer?.state]);

  function closeComputerOverlay() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setComputerOpen(false);
  }

  async function toggleComputerFullscreen() {
    const node = computerOverlayRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement === node) await document.exitFullscreen();
      else await node.requestFullscreen();
    } catch {
      // Denied by the browser; the overlay already fills the app shell.
    }
  }

  async function openComputer() {
    if (!active) return;
    const needsTakeover = !userHoldsComputerControl(computer, active.id);
    const blocked = computerTakeoverBlocked(computer, snapshot?.run?.status);
    try {
      await bootComputer({
        takeControl: needsTakeover && !blocked,
        overlay: (needsTakeover && !blocked) || computer?.state !== "running",
        force: computer?.state !== "running",
      });
      setComputerOpen(true);
    } catch {
      // computerError already set in bootComputer
    }
  }

  async function releaseComputer(reason?: ComputerReleaseReason) {
    if (!active) return;
    closeComputerOverlay();
    await rpc.computer.release({ botId: active.id, reason }).catch(() => undefined);
    await refreshThread(active.id);
  }

  const embeddedScreenUrl = embeddableScreenUrl(screenUrl);
  const hasControl = userHoldsComputerControl(computer, active?.id);
  const takeoverBlocked = computerTakeoverBlocked(computer, snapshot?.run?.status);

  async function switchComputerMode(mode: ComputerMode) {
    if (!active || mode === (computer?.mode ?? active.computerMode) || computerSwitching) return;
    setComputerSwitching(true);
    try {
      if (hasControl) {
        await rpc.computer.release({
          botId: active.id,
          reason: computer?.takeoverRequested ? "skipped" : undefined,
        });
      }
      await rpc.bots.setComputer({ botId: active.id, mode });
      setScreenUrl(null);
      autoBooted.current = null;
      await refreshBots();
      await refreshThread(active.id);
      setComputerError(null);
    } catch (error) {
      setComputerError(error instanceof Error ? error.message : t`Could not switch computer`);
    } finally {
      setComputerSwitching(false);
    }
  }

  const userName = session.data?.user.name ?? t`You`;
  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const showSidePanel =
    panel === "create" || panel === "create-group" || Boolean(panel && (active || activeGroup));

  const shell = (
    <div
      data-testid="shell-root"
      data-ready={shellReady}
      className="relative flex h-full min-w-0 overflow-hidden bg-[var(--rk-page)] text-[var(--rk-body)]"
    >
      {bootstrapMe !== undefined ? (
        <HostComputerPrompt initialMe={bootstrapMe ?? undefined} />
      ) : null}
      {mobileSidebarOpen ? (
        <button
          type="button"
          aria-label={t`Close navigation`}
          onClick={() => setMobileSidebarOpen(false)}
          className="absolute inset-y-0 end-0 start-[min(calc(100%-48px),316px)] z-30 bg-black/60 md:hidden"
        />
      ) : null}
      <aside
        className={`absolute inset-y-0 start-0 z-40 flex w-[calc(100%-48px)] max-w-[316px] shrink-0 flex-col border-e border-[var(--rk-hairline)] bg-[var(--rk-sidebar)] transition-transform md:static md:z-auto md:w-[316px] md:translate-x-0 ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        }`}
      >
        <div className="app-drag flex items-center justify-between px-[18px] pb-3 pt-4">
          <WindowChrome />
          <div className="relative flex items-center gap-2.5">
            <button
              type="button"
              aria-label={t`Activity`}
              aria-pressed={activityMode}
              title={t`Activity`}
              data-activity-mode={activityMode ? "on" : "off"}
              onClick={toggleActivityMode}
              className={`app-no-drag flex h-7 w-7 items-center justify-center rounded-full ${
                activityMode
                  ? "bg-[#4C8DFF] text-white"
                  : "text-[var(--rk-muted)] hover:text-[var(--rk-body)]"
              }`}
            >
              <Bell
                size={15}
                strokeWidth={1.8}
                fill={activityMode ? "currentColor" : "none"}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={() => setCreateMenuOpen((open) => !open)}
              className="app-no-drag text-[21px] text-[var(--rk-muted)] hover:text-[var(--rk-body)]"
              title={t`Create`}
            >
              +
            </button>
            {createMenuOpen ? (
              <div className="app-no-drag absolute end-0 top-full z-20 mt-2 min-w-[160px] rounded-xl border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] py-1 shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3.5 py-2 text-start text-[14px] text-[var(--rk-ink)] hover:bg-[var(--rk-surface-2)]"
                  onClick={() => {
                    setCreateMenuOpen(false);
                    setPanel("create");
                  }}
                >
                  <Trans>New bot</Trans>
                </button>
                <button
                  type="button"
                  className="block w-full px-3.5 py-2 text-start text-[14px] text-[var(--rk-ink)] hover:bg-[var(--rk-surface-2)]"
                  onClick={() => {
                    setCreateMenuOpen(false);
                    setPanel("create-group");
                  }}
                >
                  <Trans>New group</Trans>
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {bootstrapMe ? (
          <WorkspacePicker
            workspaces={bootstrapMe.workspaces}
            workspaceId={bootstrapMe.workspaceId}
            busy={workspaceBusy}
            onSwitch={(id) =>
              void changeWorkspace(() => rpc.workspaces.switch({ workspaceId: id }))
            }
            onCreate={(name) => void changeWorkspace(() => rpc.workspaces.create({ name }))}
            onRename={async (id, name) => {
              const workspace = await rpc.workspaces.update({ workspaceId: id, name });
              setBootstrapMe((current) =>
                current
                  ? {
                      ...current,
                      workspaceName:
                        current.workspaceId === workspace.id
                          ? workspace.name
                          : current.workspaceName,
                      workspaces: current.workspaces.map((entry) =>
                        entry.id === workspace.id ? workspace : entry,
                      ),
                    }
                  : current,
              );
            }}
            onDelete={(id) =>
              void changeWorkspace(() => rpc.workspaces.remove({ workspaceId: id }))
            }
          />
        ) : null}
        <div className="mx-3.5 mb-3 flex items-center gap-2.5 rounded-xl border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface)] px-3 py-2 text-[14px] text-[var(--rk-muted-2)]">
          <span>⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t`Search`}
            className="w-full bg-transparent outline-none"
          />
        </div>
        <div className="rk-scroll flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-2.5">
          {showWorkspaceSearch ? (
            <WorkspaceSearchResults
              hits={searchHits}
              loading={searchLoading}
              onSelect={(hit) => void jumpToSearchHit(hit)}
            />
          ) : (
            <>
              <ApprovalsNavButton
                count={pendingApprovals.length}
                onOpen={() => {
                  setMobileSidebarOpen(false);
                  setApprovalsOpen(true);
                }}
              />
              {activityMode ? (
                <ActivityList
                  onOpenRun={(run) => {
                    setMobileSidebarOpen(false);
                    if (run.groupId) navigate(`/app/g/${run.groupId}`);
                    else navigate(`/app/${run.botId}`);
                  }}
                />
              ) : null}
              {sidebarGroups.map((group) => (
                <div key={group.key} data-sidebar-group={group.key}>
                  {group.title ? (
                    <div className="px-2.5 pb-1 pt-3 text-[12.5px] font-medium text-[var(--rk-muted-2)]">
                      {group.title}
                    </div>
                  ) : null}
                  {group.bots.map((bot) => (
                    <button
                      key={bot.id}
                      type="button"
                      onClick={() => {
                        setMobileSidebarOpen(false);
                        navigate(`/app/${bot.id}`);
                      }}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setBotMenu({
                          botId: bot.id,
                          position: { x: event.clientX, y: event.clientY },
                        });
                      }}
                      className="flex w-full gap-3 rounded-xl px-2.5 py-[11px] text-start"
                      style={{
                        background:
                          !inGroup && active?.id === bot.id ? "var(--rk-hover)" : "transparent",
                      }}
                    >
                      <BotAvatar
                        color={bot.color}
                        identity={bot.id}
                        size={38}
                        status={liveStatusByBotId.get(bot.id) ?? bot.status}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span
                            dir="auto"
                            className={`truncate text-[15px] text-[var(--rk-ink)] ${
                              bot.unread ? "font-semibold" : "font-medium"
                            }`}
                          >
                            {bot.name}
                            {bot.unread ? (
                              <span className="sr-only">
                                <Trans> (unread)</Trans>
                              </span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-[var(--rk-muted-2)]">
                            {(liveStatusByBotId.get(bot.id) ?? bot.status) === "idle"
                              ? ""
                              : (liveStatusByBotId.get(bot.id) ?? bot.status)}
                            {bot.unread ? (
                              <span
                                aria-hidden="true"
                                className="inline-block h-2 w-2 rounded-full bg-[#8B5CF6]"
                              />
                            ) : null}
                          </span>
                        </div>
                        <div
                          dir="auto"
                          className={`mt-0.5 truncate text-[13.5px] ${
                            bot.unread
                              ? "font-medium text-[var(--rk-body)]"
                              : "text-[var(--rk-muted)]"
                          }`}
                        >
                          {bot.preview || bot.title}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
          {!showWorkspaceSearch
            ? groups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    setMobileSidebarOpen(false);
                    navigate(`/app/g/${group.id}`);
                  }}
                  className="flex gap-3 rounded-xl px-2.5 py-[11px] text-start"
                  style={{
                    background:
                      inGroup && activeGroup?.id === group.id ? "var(--rk-hover)" : "transparent",
                  }}
                >
                  <GroupAvatar
                    members={(group.id === activeSnapshot?.groupId
                      ? (activeSnapshot.members ?? group.members)
                      : group.members
                    ).map((member) => ({
                      ...member,
                      status: liveStatusByBotId.get(member.botId) ?? member.status,
                    }))}
                    size={38}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        dir="auto"
                        className={`min-w-0 truncate text-[15px] text-[var(--rk-ink)] ${
                          group.unread ? "font-semibold" : "font-medium"
                        }`}
                      >
                        {group.name}
                      </span>
                      {group.unread ? (
                        <span
                          aria-hidden="true"
                          className="inline-block h-2 w-2 rounded-full bg-[#8B5CF6]"
                        />
                      ) : null}
                    </div>
                    <div
                      dir="auto"
                      className="mt-0.5 truncate text-[13.5px] text-[var(--rk-muted)]"
                    >
                      {group.members.map((member) => member.name).join(", ")}
                    </div>
                  </div>
                </button>
              ))
            : null}
          {archivedBots.length > 0 && !showWorkspaceSearch ? (
            <div className="mt-2 border-t border-[var(--rk-hairline-strong)] pt-2">
              <button
                type="button"
                aria-expanded={archivedOpen}
                onClick={() => setArchivedOpen((open) => !open)}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[13.5px] text-[var(--rk-muted)] hover:bg-[var(--rk-hover)]"
              >
                <span>
                  <Trans>Archived</Trans>
                </span>
                <span>{archivedBots.length}</span>
              </button>
              {archivedOpen
                ? archivedBots.map((bot) => (
                    <div key={bot.id} className="flex items-center gap-2 rounded-lg px-2.5 py-2">
                      <BotAvatar
                        color={bot.color}
                        identity={bot.id}
                        size={28}
                        status={bot.status}
                      />
                      <span
                        className="min-w-0 flex-1 truncate text-[14px] text-[var(--rk-muted)]"
                        dir="auto"
                      >
                        {bot.name}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          void rpc.bots.restore({ botId: bot.id }).then(() => refreshBots(true))
                        }
                        className="text-[12.5px] text-[var(--rk-body)] hover:text-[var(--rk-ink)]"
                      >
                        <Trans>Restore</Trans>
                      </button>
                      <button
                        type="button"
                        aria-label={t`Delete ${bot.name}`}
                        onClick={() => setDeleteTarget(bot)}
                        className="text-[12.5px] text-[#FF5364]"
                      >
                        <Trans>Delete</Trans>
                      </button>
                    </div>
                  ))
                : null}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setPluginsOpen(true)}
          className="mx-3 mb-1 flex items-center gap-3 rounded-[11px] px-2.5 py-2 hover:bg-[var(--rk-hover)]"
        >
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[var(--rk-solid-ink)] text-[var(--rk-muted)]">
            <Puzzle size={15} strokeWidth={1.7} />
          </span>
          <span className="text-[14.5px] text-[var(--rk-body)]">
            <Trans>Plugins</Trans>
          </span>
        </button>
        <div className="relative">
          {menuOpen ? (
            <div className="absolute bottom-14 inset-x-3 rounded-2xl border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)] p-2 shadow-[var(--rk-shadow)]">
              {themePickerOpen ? (
                <>
                  <button
                    type="button"
                    aria-label={t`Back`}
                    onClick={() => setThemePickerOpen(false)}
                    className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[var(--rk-hover)]"
                  >
                    <ChevronLeft size={16} strokeWidth={1.7} className="text-[var(--rk-muted)]" />
                    <span className="flex-1 text-start text-[14.5px] text-[var(--rk-ink)]">
                      <Trans>Themes</Trans>
                    </span>
                  </button>
                  <UiThemePicker
                    value={uiTheme}
                    onChange={(id) => {
                      setUiThemeId(id);
                      setUiTheme(id);
                    }}
                  />
                </>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label={t`Settings`}
                    onClick={() => {
                      setMenuOpen(false);
                      setAccountSettingsFocusUsage(false);
                      setAccountSettingsOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[var(--rk-hover)]"
                  >
                    <span className="text-[var(--rk-muted)]">⚙</span>
                    <span className="flex-1 text-start text-[14.5px] text-[var(--rk-ink)]">
                      <Trans>Settings</Trans>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setModelsOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[var(--rk-hover)]"
                  >
                    <Cpu size={16} strokeWidth={1.7} className="text-[var(--rk-muted)]" />
                    <span className="flex-1 text-start text-[14.5px] text-[var(--rk-ink)]">
                      <Trans>Models</Trans>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setMemorySettingsOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[var(--rk-hover)]"
                  >
                    <span className="text-[var(--rk-muted)]">◇</span>
                    <span className="flex-1 text-start text-[14.5px] text-[var(--rk-ink)]">
                      <Trans>Memory</Trans>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setVoiceOpen(true);
                    }}
                    className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[var(--rk-hover)]"
                  >
                    <Volume2 size={16} strokeWidth={1.7} className="text-[var(--rk-muted)]" />
                    <span className="flex-1 text-start text-[14.5px] text-[var(--rk-ink)]">
                      <Trans>Voice</Trans>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[var(--rk-hover)]"
                    onClick={async () => {
                      setUsage(await rpc.usage.summary());
                    }}
                  >
                    <Gauge size={16} strokeWidth={1.7} className="text-[var(--rk-muted)]" />
                    <span className="flex-1 text-start text-[14.5px] text-[var(--rk-ink)]">
                      <Trans>Usage</Trans>
                    </span>
                  </button>
                  {usage ? (
                    <p className="px-3 pb-2 text-[12.5px] text-[var(--rk-muted)]">
                      <Trans>
                        {usage.runs} runs · {usage.inputTokens + usage.outputTokens} tokens
                      </Trans>
                    </p>
                  ) : null}
                  <button
                    type="button"
                    data-testid="ui-theme-menu"
                    onClick={() => setThemePickerOpen(true)}
                    className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[var(--rk-hover)]"
                  >
                    <Palette size={16} strokeWidth={1.7} className="text-[var(--rk-muted)]" />
                    <span className="flex-1 text-start text-[14.5px] text-[var(--rk-ink)]">
                      <Trans>Themes</Trans>
                    </span>
                    <span className="text-[12.5px] text-[var(--rk-muted)]">
                      {uiThemeById(uiTheme).label}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void authClient.signOut().then(() => navigate("/"))}
                    className="flex w-full items-center gap-3 rounded-[11px] px-3 py-2.5 hover:bg-[var(--rk-hover)]"
                  >
                    <LogOut size={16} strokeWidth={1.7} className="text-[var(--rk-muted)]" />
                    <span className="text-[14.5px] text-[var(--rk-ink)]">
                      <Trans>Log out</Trans>
                    </span>
                  </button>
                </>
              )}
            </div>
          ) : null}
          <button
            type="button"
            data-testid="user-menu-trigger"
            onClick={() => {
              setMenuOpen((open) => {
                if (!open) setUiThemeId(resolveUiTheme());
                return !open;
              });
              setThemePickerOpen(false);
            }}
            className="flex items-center gap-[11px] px-[18px] py-3.5"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--rk-surface)] text-[12px] text-[var(--rk-muted)]">
              {initials}
            </span>
            <span className="text-[14.5px] text-[var(--rk-body)]">{userName}</span>
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-[var(--rk-main)]">
        <div className="flex items-center justify-between border-b border-[var(--rk-surface)] px-3 py-[17px] md:px-[22px]">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label={t`Open navigation`}
              onClick={() => setMobileSidebarOpen(true)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--rk-muted)] hover:bg-[var(--rk-hover)] md:hidden"
            >
              <Menu size={19} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              data-testid="bot-settings-trigger"
              onClick={() => setPanel(inGroup ? "group-settings" : "settings")}
              className="flex min-w-0 items-center gap-3"
            >
              {inGroup ? (
                <GroupAvatar
                  members={(activeSnapshot?.members ?? activeGroup?.members ?? []).map(
                    (member) => ({
                      ...member,
                      status: liveStatusByBotId.get(member.botId) ?? member.status,
                    }),
                  )}
                  size={26}
                />
              ) : active ? (
                <BotAvatar
                  color={active.color}
                  identity={active.id}
                  size={26}
                  status={liveStatusByBotId.get(active.id) ?? active.status}
                />
              ) : null}
              <span className="min-w-0">
                <span
                  className="block truncate text-[16px] font-medium text-[var(--rk-ink)]"
                  dir="auto"
                >
                  {inGroup
                    ? (activeGroup?.name ?? activeSnapshot?.groupName ?? t`Group`)
                    : (active?.name ?? t`Select a bot`)}
                </span>
              </span>
            </button>
          </div>
          <div className="flex items-center gap-1">
            {!inGroup && active ? (
              <button
                type="button"
                title={voiceStatus?.ready ? t`Call` : t`Set up voice to call`}
                aria-label={t`Call`}
                onClick={() => {
                  if (!voiceStatus?.ready) {
                    setVoiceOpen(true);
                    return;
                  }
                  setCallOpen(true);
                }}
                className="grid h-[30px] w-[34px] place-items-center rounded-[9px] hover:bg-[var(--rk-hover)]"
                style={{ background: callOpen ? "var(--rk-hover)" : "transparent" }}
              >
                <Phone size={16} strokeWidth={1.6} className="text-[var(--rk-muted)]" />
              </button>
            ) : null}
            {!inGroup ? (
              <button
                type="button"
                title={t`Agent computer`}
                onClick={() => {
                  const next = panel === "computer" ? null : "computer";
                  setPanel(next);
                  if (next === "computer" && active) {
                    // Refresh run/computer so Take control isn't stuck on a stale busyBotName.
                    void refreshThread(active.id).catch(() => undefined);
                  }
                }}
                className="grid h-[30px] w-[34px] place-items-center rounded-[9px] hover:bg-[var(--rk-hover)]"
                style={{ background: panel ? "var(--rk-hover)" : "transparent" }}
              >
                <Monitor size={18} strokeWidth={1.6} className="text-[var(--rk-muted)]" />
              </button>
            ) : null}
          </div>
        </div>
        <Transcript
          key={activeSnapshot?.threadId}
          scrollRef={messageScroll}
          artifactTarget={transcriptArtifactTarget}
          messages={activeSnapshot?.messages ?? []}
          olderCursor={activeSnapshot?.olderCursor ?? null}
          loadingOlder={loadingOlder}
          answerableAskMessageId={answerableAskMessageId}
          running={transcriptRunning}
          workingBots={workingBots}
          workingStartedAt={workingStartedAtMs}
          onLoadOlder={loadOlder}
          onOpenBot={openBot}
          onAnswer={answerMessage}
          onReply={setReplyTarget}
          onJumpToMessage={jumpToReplyMessage}
          onOpenPeerMessages={(peerBotId) => {
            setPeerMessagesFocusId(peerBotId);
            setPeerMessagesOpen(true);
          }}
          memberName={resolveTranscriptMemberName}
          peerBot={resolveTranscriptBot}
          onRefresh={refreshActiveThread}
          onBotChanged={refreshBots}
          onAddRoutine={addSkillRoutine}
          voiceReady={Boolean(voiceStatus?.ready)}
          speakingMessageId={speakingMessageId}
          onSpeak={speakMessage}
        />
        {recordingSkill ? (
          <div className="px-6 pb-2 text-center text-[13px] text-[#E65707]">
            <Trans>Teaching in progress — stop teaching before sending a new message.</Trans>
          </div>
        ) : null}
        <Composer
          key={inGroup ? `group:${groupId}` : `bot:${active?.id}`}
          activeName={inGroup ? (activeGroup?.name ?? activeSnapshot?.groupName) : active?.name}
          running={composerRunning}
          disabled={Boolean(recordingSkill)}
          pendingAttachments={activePendingAttachments}
          attachmentNotice={attachmentNotice}
          sendError={sendError}
          dictationError={dictationError}
          sending={sending}
          fileInputRef={fileInputRef}
          onAttachmentPick={onAttachmentPick}
          onRemoveAttachment={removeAttachment}
          onSend={sendMessage}
          onStop={stopRun}
          replyTarget={activeReplyTarget}
          replyTargetName={replyTargetName}
          onClearReply={() => setReplyTarget(null)}
          mentionTargets={composerMentionTargets}
          agentSkills={agentSkills}
          onSlashOpen={refreshAgentSkills}
          onSlashAction={(action) => {
            if (action === "chat-settings") {
              setPanel(inGroup ? "group-settings" : "settings");
              return;
            }
            if (action === "settings-general") {
              setAccountSettingsFocusUsage(false);
              setAccountSettingsOpen(true);
              return;
            }
            if (action === "settings-usage") {
              setAccountSettingsFocusUsage(true);
              setAccountSettingsOpen(true);
              void rpc.usage
                .summary()
                .then(setUsage)
                .catch(() => undefined);
            }
          }}
          dictating={dictating}
          transcribe={Boolean(voiceStatus?.transcribe)}
          onDictateStart={(onFinal) => {
            void dictation.listen({
              mode: "hold",
              transcribe: Boolean(voiceStatus?.transcribe),
              onFinal,
            });
          }}
          onDictateStop={() => dictation.submitHold()}
        />
      </main>

      <aside
        data-testid="side-panel"
        data-panel={panel ?? "closed"}
        data-computer-enlarged={panel === "computer" && computerEnlarged ? "true" : "false"}
        className={computerSidePanelClass(showSidePanel, panel === "computer" && computerEnlarged)}
      >
        {showSidePanel ? (
          <div className={computerSidePanelBodyClass(panel === "computer" && computerEnlarged)}>
            {panel !== "routine" &&
            panel !== "create" &&
            panel !== "create-group" &&
            panel !== "group-settings" ? (
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[13.5px] text-[var(--rk-muted)]">
                  {panel === "settings" ? (
                    <Trans>Settings</Trans>
                  ) : active ? (
                    (computer?.state ?? active.status)
                  ) : (
                    <Trans>Group</Trans>
                  )}
                </span>
                <div className="flex gap-3.5">
                  {panel === "computer" ? (
                    <button
                      type="button"
                      aria-label={computerEnlarged ? t`Shrink computer` : t`Enlarge computer`}
                      aria-pressed={computerEnlarged}
                      data-testid="computer-enlarge"
                      onClick={() => setComputerEnlarged((current) => !current)}
                      className={
                        computerEnlarged
                          ? "text-[var(--rk-ink)]"
                          : "text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
                      }
                    >
                      {computerEnlarged ? (
                        <Minimize2 size={16} strokeWidth={1.7} />
                      ) : (
                        <Maximize2 size={16} strokeWidth={1.7} />
                      )}
                    </button>
                  ) : null}
                  {active ? (
                    <button
                      type="button"
                      aria-label={panel === "settings" ? t`Show computer` : t`Show settings`}
                      onClick={() => setPanel(panel === "settings" ? "computer" : "settings")}
                      className={
                        panel === "settings"
                          ? "text-[var(--rk-ink)]"
                          : "text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
                      }
                    >
                      <Settings size={16} strokeWidth={1.7} />
                    </button>
                  ) : null}
                  <button type="button" aria-label={t`Close panel`} onClick={() => setPanel(null)}>
                    <X size={16} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            ) : null}
            {panel === "computer" && active ? (
              <div className={computerEnlarged ? "flex min-h-0 flex-1 flex-col" : undefined}>
                <div
                  className={
                    computerEnlarged
                      ? "relative min-h-[240px] flex-1 overflow-hidden rounded-[14px] bg-[var(--rk-main)]"
                      : "relative aspect-[16/10] overflow-hidden rounded-[14px] bg-[var(--rk-main)]"
                  }
                >
                  {computerOpen ? (
                    <div className="grid h-full place-items-center text-sm text-[var(--rk-muted-2)]">
                      <Trans>Open in full window</Trans>
                    </div>
                  ) : computer?.kind === "desktop" ? (
                    <div className="grid h-full place-items-center px-6 text-center text-sm text-[var(--rk-muted-2)]">
                      <Trans>
                        This bot runs on this computer, not a Linux desktop. Shell and files use
                        your home folder.
                      </Trans>
                    </div>
                  ) : computer?.state === "running" && embeddedScreenUrl ? (
                    <iframe
                      title={t`Bot screen preview`}
                      src={embeddedScreenUrl}
                      sandbox={screenIframeSandbox(embeddedScreenUrl)}
                      className="h-full w-full border-0 bg-black"
                      allow="clipboard-read; clipboard-write"
                      style={{ pointerEvents: "none" }}
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-[var(--rk-muted-2)]">
                      {computerPlaceholder(
                        computer?.state,
                        booting,
                        computerLabel(computer?.mode, active.name),
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="absolute inset-0 cursor-pointer"
                    aria-label={t`Open computer`}
                    onClick={() => void openComputer()}
                  />
                  {computerOpen ? null : (
                    <button
                      type="button"
                      className="absolute end-2.5 top-2.5 z-10 grid h-8 w-8 place-items-center rounded-[10px] bg-[rgba(4,4,5,.72)] text-[var(--rk-ink)] hover:bg-[rgba(4,4,5,.9)]"
                      aria-label={computerEnlarged ? t`Shrink computer` : t`Enlarge computer`}
                      aria-pressed={computerEnlarged}
                      data-testid="computer-enlarge-screen"
                      onClick={(event) => {
                        event.stopPropagation();
                        setComputerEnlarged((current) => !current);
                      }}
                    >
                      {computerEnlarged ? (
                        <Minimize2 size={14} strokeWidth={1.8} />
                      ) : (
                        <Maximize2 size={14} strokeWidth={1.8} />
                      )}
                    </button>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="min-w-0 text-[13.5px] text-[var(--rk-muted)]">
                    {hasControl
                      ? t`You have control`
                      : computerError
                        ? computerError
                        : computer?.busyBotName
                          ? t`${computer.busyBotName} is using it`
                          : computer?.state === "suspended"
                            ? t`Asleep`
                            : computerLabel(computer?.mode, active.name)}
                  </span>
                  {hasControl ? (
                    <ComputerReleaseActions
                      takeoverRequested={computer?.takeoverRequested ?? false}
                      onRelease={releaseComputer}
                    />
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={takeoverBlocked}
                      title={takeoverBlocked ? t`Stop the bot first` : undefined}
                      onClick={() => void openComputer()}
                    >
                      <Trans>Take control</Trans>
                    </Button>
                  )}
                </div>
                {computer?.state === "error" ||
                computer?.state === "stopped" ||
                (computer?.state === "running" && !embeddedScreenUrl) ? (
                  <ComputerMaintenanceActions
                    botId={active.id}
                    computer={computer}
                    compact
                    onChanged={async () => {
                      await refreshThread(active.id);
                    }}
                  />
                ) : null}
                <ComputerModePicker
                  value={computer?.mode ?? active.computerMode}
                  disabled={computerSwitching}
                  onChange={(mode) => void switchComputerMode(mode)}
                />
                <div
                  className={
                    computerEnlarged ? "mt-3 min-h-0 max-h-[36%] overflow-y-auto" : undefined
                  }
                >
                  <ApprovalsPanelSection
                    items={botApprovals}
                    busyId={approvalBusyId}
                    onViewAll={() => setApprovalsOpen(true)}
                    onView={openApproval}
                    onApprove={(item) => void answerApproval(item)}
                  />
                  <div className="mt-[30px] mb-3 text-[14px] text-[var(--rk-muted)]">
                    <Trans>Routines</Trans>
                  </div>
                  {activeRoutines.map((routine) => {
                    const routineRunning =
                      snapshot?.run?.routineId === routine.id && isActive(snapshot.run.status);
                    return (
                      <div
                        key={routine.id}
                        className="flex w-full items-center gap-2 rounded-[11px] px-2.5 py-2.5 hover:bg-[#121214]"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setRoutineDraft({
                              name: routine.name,
                              prompt: routine.prompt,
                              schedules: routine.crons.map(presetFromCron),
                            });
                            setEditingRoutine(routine);
                            setPanel("routine");
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 text-start"
                        >
                          <span className="text-[#E65707]">◷</span>
                          <span
                            className="min-w-0 flex-1 truncate text-start text-[14.5px] text-[var(--rk-ink)]"
                            dir="auto"
                          >
                            {routine.name}
                          </span>
                          <span className="shrink-0 text-[13px] text-[var(--rk-muted-2)]">
                            {routine.crons.map(formatCron).join(" · ")}
                          </span>
                        </button>
                        {routineRunning ? (
                          <button
                            type="button"
                            onClick={() => void stopRun()}
                            className="shrink-0 rounded-full bg-[rgba(230,87,7,.14)] px-2.5 py-1 text-[12px] text-[#E65707]"
                          >
                            <Trans>Running · Stop</Trans>
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setRoutineDraft({ name: "", prompt: "", schedules: [defaultCronPreset()] });
                      setEditingRoutine(null);
                      setPanel("routine");
                    }}
                    className="mt-1 flex items-center gap-2.5 px-2.5 py-2.5 text-[14.5px] text-[var(--rk-muted)]"
                  >
                    + <Trans>New routine</Trans>
                  </button>
                  {active ? (
                    <TeachComputerSection
                      botId={active.id}
                      computer={computer}
                      skills={activeTaughtSkills}
                      busy={teachBusy}
                      onRefresh={refreshActiveThread}
                      onOpenComputer={openComputer}
                      onStopTeaching={stopTeaching}
                      onAddRoutine={(skill) => {
                        setRoutineDraft({
                          name: skill.name || skill.goal.slice(0, 80),
                          prompt: `Run taught skill: ${skill.name || skill.goal}\n${skill.playbook.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`,
                          schedules: [defaultCronPreset()],
                        });
                        setEditingRoutine(null);
                        setPanel("routine");
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
            {panel === "create-group" ? (
              <CreateGroupForm
                bots={bots}
                onCancel={() => setPanel(null)}
                onCreate={(input) => createGroup(input)}
              />
            ) : null}
            {panel === "group-settings" && activeGroup ? (
              <GroupSettings
                key={activeGroup.id}
                group={activeGroup}
                bots={bots}
                onSave={async (input) => {
                  const updated = await rpc.groups.update({ groupId: activeGroup.id, ...input });
                  setGroups((current) =>
                    current.map((group) => (group.id === updated.id ? updated : group)),
                  );
                  setPanel(null);
                  await Promise.all([refreshBots(), refreshGroupThread(activeGroup.id)]).catch(
                    () => undefined,
                  );
                }}
                onRemove={async () => {
                  await rpc.groups.remove({ groupId: activeGroup.id });
                  const remainingGroups = groups.filter((group) => group.id !== activeGroup.id);
                  setGroups(remainingGroups);
                  setPanel(null);
                  navigate(firstThreadRoute(bots, remainingGroups), { replace: true });
                  await refreshBots().catch(() => undefined);
                }}
              />
            ) : null}
            {panel === "create" ? (
              <CreateBotForm
                onCancel={() => setPanel(null)}
                onCreate={(input) => createBot(input)}
              />
            ) : null}
            {panel === "settings" && active ? (
              <BotSettings
                key={active.id}
                bot={active}
                computer={computer}
                memoryProviderConfigured={memoryProviderConfig != null}
                onSave={async ({ computerMode, ...patch }) => {
                  if (computerMode !== active.computerMode) {
                    await rpc.bots.setComputer({
                      botId: active.id,
                      mode: computerMode,
                    });
                  }
                  await rpc.bots.update({ botId: active.id, ...patch });
                  await refreshBots();
                }}
                onExport={async () => {
                  const manifest = await rpc.export.bot({ botId: active.id });
                  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
                    type: "application/json",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${active.name.toLowerCase().replace(/\s+/g, "-")}-export.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                onClear={() => setClearTarget(active)}
                onComputerChanged={async () => {
                  await refreshThread(active.id);
                }}
              />
            ) : null}
            {panel === "routine" && active ? (
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPanel("computer")}
                    className="text-[var(--rk-muted)]"
                  >
                    <ChevronLeft size={18} strokeWidth={1.8} />
                  </button>
                  <div className="text-[15.5px] font-medium text-[var(--rk-ink)]">
                    <Trans>Routine</Trans>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPanel(null)}
                    className="text-[var(--rk-muted-2)]"
                  >
                    <X size={16} strokeWidth={1.8} />
                  </button>
                </div>
                <label className="text-[14px] text-[var(--rk-muted)]">
                  <Trans>Name</Trans>
                  <input
                    value={routineDraft.name}
                    onChange={(e) => setRoutineDraft((s) => ({ ...s, name: e.target.value }))}
                    className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 text-[var(--rk-ink)]"
                  />
                </label>
                <label className="mt-5 block text-[14px] text-[var(--rk-muted)]">
                  <Trans>Instruction</Trans>
                  <textarea
                    value={routineDraft.prompt}
                    onChange={(e) => setRoutineDraft((s) => ({ ...s, prompt: e.target.value }))}
                    rows={4}
                    className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 text-[var(--rk-ink)]"
                  />
                </label>
                <div className="mt-5 text-[14px] text-[var(--rk-muted)]">
                  <Trans>When to run</Trans>
                  <span className="ml-2 text-[12.5px] text-[#6E6E74]">
                    {editingRoutine?.timezone ?? localTimezone()}
                  </span>
                  <Suspense fallback={null}>
                    <RoutineSchedules
                      value={routineDraft.schedules}
                      onChange={(schedules) => setRoutineDraft((s) => ({ ...s, schedules }))}
                    />
                  </Suspense>
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={savingRoutine || runningRoutine}
                    onClick={async () => {
                      if (routineSavePending.current) return;
                      const targetBotId = active.id;
                      const targetRoutine = editingRoutine;
                      if (targetRoutine && targetRoutine.botId !== targetBotId) return;
                      const saveRequest = ++routineSaveRequest.current;
                      routineSavePending.current = true;
                      setSavingRoutine(true);
                      setRoutineError(null);
                      try {
                        const crons = routineDraft.schedules.map(cronFromPreset);
                        if (targetRoutine) {
                          await rpc.routines.update({
                            routineId: targetRoutine.id,
                            name: routineDraft.name || t`Routine`,
                            prompt: routineDraft.prompt || t`Check in.`,
                            crons,
                          });
                        } else {
                          await rpc.routines.create({
                            botId: targetBotId,
                            name: routineDraft.name || t`Routine`,
                            prompt: routineDraft.prompt || t`Check in.`,
                            crons,
                            timezone: localTimezone(),
                            active: true,
                            notify: true,
                          });
                        }
                      } catch (error) {
                        if (
                          routineSaveRequest.current !== saveRequest ||
                          activeBotId.current !== targetBotId
                        ) {
                          return;
                        }
                        setRoutineError(
                          error instanceof Error ? error.message : t`Could not save routine`,
                        );
                        return;
                      } finally {
                        routineSavePending.current = false;
                        setSavingRoutine(false);
                      }
                      if (
                        routineSaveRequest.current !== saveRequest ||
                        activeBotId.current !== targetBotId
                      ) {
                        return;
                      }
                      await refreshThread(targetBotId).catch(() => undefined);
                      if (
                        routineSaveRequest.current === saveRequest &&
                        activeBotId.current === targetBotId
                      ) {
                        setPanel("computer");
                      }
                    }}
                    className="rounded-[11px] bg-[var(--rk-solid)] px-4 py-2 text-[var(--rk-solid-ink)] disabled:opacity-40"
                  >
                    {savingRoutine ? t`Saving…` : t`Save`}
                  </button>
                  {editingRoutine?.botId === active.id ? (
                    <>
                      <button
                        type="button"
                        disabled={savingRoutine || runningRoutine}
                        onClick={async () => {
                          if (routineRunPending.current) return;
                          const targetBotId = active.id;
                          const targetRoutine = editingRoutine;
                          if (!targetRoutine) return;
                          routineRunPending.current = true;
                          setRunningRoutine(true);
                          try {
                            await rpc.routines.testRun({ routineId: targetRoutine.id });
                            await refreshThread(targetBotId);
                          } finally {
                            routineRunPending.current = false;
                            setRunningRoutine(false);
                          }
                        }}
                        className="rounded-[11px] border border-[var(--rk-hairline-strong)] px-4 py-2 text-[14px] text-[var(--rk-ink)] disabled:opacity-40"
                      >
                        {runningRoutine ? t`Running…` : t`Run now`}
                      </button>
                      <button
                        type="button"
                        disabled={savingRoutine || runningRoutine}
                        onClick={() => setDeleteRoutineTarget(editingRoutine)}
                        className="rounded-[11px] px-4 py-2 text-[14px] text-[#FF5364] disabled:opacity-40"
                      >
                        <Trans>Delete routine</Trans>
                      </button>
                    </>
                  ) : null}
                </div>
                {routineError ? (
                  <p role="alert" className="mt-3 text-[13px] text-[#EF6461]">
                    {routineError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>

      <Suspense fallback={null}>
        {contextBot && botMenu ? (
          <BotContextMenu
            bot={contextBot}
            position={botMenu.position}
            onClose={closeBotMenu}
            sections={botSections}
            onTogglePinned={() => {
              setBotMenu(null);
              void rpc.bots
                .update({ botId: contextBot.id, pinned: !contextBot.pinned })
                .then(() => refreshBots());
            }}
            onToggleUnread={() => {
              const unread = !contextBot.unread;
              setBotMenu(null);
              const request = unread ? markBotUnread(contextBot.id) : markBotRead(contextBot.id);
              void request.catch(() => undefined);
            }}
            onMoveToSection={(sectionId) => {
              setBotMenu(null);
              if (sectionId === contextBot.sectionId) return;
              void rpc.bots.update({ botId: contextBot.id, sectionId }).then(() => refreshBots());
            }}
            onCreateSection={() => {
              setNewSectionBot(contextBot);
              setBotMenu(null);
            }}
            onEdit={() => {
              navigate(`/app/${contextBot.id}`);
              setPanel("settings");
              setBotMenu(null);
            }}
            onDuplicate={() => {
              setBotMenu(null);
              void rpc.bots.duplicate({ botId: contextBot.id }).then(async (bot) => {
                await refreshBots();
                navigate(`/app/${bot.id}`);
              });
            }}
            onClear={() => {
              setClearTarget(contextBot);
              setBotMenu(null);
            }}
            onArchive={() => {
              setBotMenu(null);
              void rpc.bots.archive({ botId: contextBot.id }).then(() => refreshBots(true));
            }}
            onDelete={() => {
              setDeleteTarget(contextBot);
              setBotMenu(null);
            }}
          />
        ) : null}

        {deleteTarget ? (
          <DeleteBotDialog
            bot={deleteTarget}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={async (deleteMemories) => {
              await rpc.bots.remove({ botId: deleteTarget.id, deleteMemories });
              setDeleteTarget(null);
              setPanel(null);
              await refreshBots(true);
            }}
          />
        ) : null}

        {newSectionBot ? (
          <NewBotSectionDialog
            bot={newSectionBot}
            onCancel={() => setNewSectionBot(null)}
            onConfirm={async (name) => {
              await rpc.botSections.create({ botId: newSectionBot.id, name });
              setNewSectionBot(null);
              await refreshBots();
            }}
          />
        ) : null}

        {clearTarget ? (
          <ClearConversationDialog
            bot={clearTarget}
            onCancel={() => setClearTarget(null)}
            onConfirm={async () => {
              await rpc.threads.clear({ botId: clearTarget.id });
              if (active?.id === clearTarget.id) {
                expandedHistoryThread.current = null;
                pinnedAroundRef.current = null;
                historyEpoch.current += 1;
                updateSnapshot((current) =>
                  current ? { ...current, messages: [], olderCursor: null, run: null } : current,
                );
              }
              setClearTarget(null);
              await refreshBots();
            }}
          />
        ) : null}

        {deleteRoutineTarget ? (
          <DeleteRoutineDialog
            routine={deleteRoutineTarget}
            onCancel={() => setDeleteRoutineTarget(null)}
            onConfirm={async () => {
              const target = deleteRoutineTarget;
              await rpc.routines.remove({ routineId: target.id });
              setDeleteRoutineTarget(null);
              setEditingRoutine((current) => (current?.id === target.id ? null : current));
              if (activeBotId.current !== target.botId) return;
              await refreshThread(target.botId);
              if (activeBotId.current === target.botId) setPanel("computer");
            }}
          />
        ) : null}

        {pluginsOpen ? (
          <PluginsOverlay
            activeBotId={activeBotId.current}
            onClose={() => setPluginsOpen(false)}
            onOpenMcp={() => {
              setPluginsOpen(false);
              setMcpOpen(true);
            }}
          />
        ) : null}
        {approvalsOpen ? (
          <ApprovalsOverlay
            items={pendingApprovals}
            loading={approvalsLoading}
            busyId={approvalBusyId}
            onClose={() => setApprovalsOpen(false)}
            onView={openApproval}
            onApprove={(item) => void answerApproval(item)}
          />
        ) : null}
        {mcpOpen ? <McpServersOverlay onClose={() => setMcpOpen(false)} /> : null}
      </Suspense>

      <Suspense fallback={null}>
        {accountSettingsOpen ? (
          <AccountSettingsOverlay
            name={userName}
            email={session.data?.user.email}
            usage={usage}
            focusUsage={accountSettingsFocusUsage}
            avatarStyle={bootstrapMe?.avatarStyle ?? "robot"}
            onAvatarStyleChange={async (avatarStyle) => {
              const nextMe = await rpc.preferences.update({ avatarStyle });
              setBootstrapMe(nextMe);
            }}
            onClose={() => {
              setAccountSettingsOpen(false);
              setAccountSettingsFocusUsage(false);
            }}
          />
        ) : null}
        {modelsOpen ? <ModelSettingsOverlay onClose={() => setModelsOpen(false)} /> : null}
        {peerMessagesOpen && active ? (
          <PeerMessagesOverlay
            botId={active.id}
            botName={active.name}
            messages={activeSnapshot?.messages ?? []}
            olderCursor={activeSnapshot?.olderCursor ?? null}
            initialPeerBotId={peerMessagesFocusId}
            onClose={() => {
              setPeerMessagesOpen(false);
              setPeerMessagesFocusId(null);
            }}
          />
        ) : null}
        {voiceOpen ? (
          <VoiceSettingsOverlay
            onClose={() => {
              setVoiceOpen(false);
              void rpc.voice
                .status()
                .then(setVoiceStatus)
                .catch(() => undefined);
            }}
          />
        ) : null}
        {callOpen && active ? (
          <CallView
            botId={active.id}
            botName={active.name}
            transcribe={Boolean(voiceStatus?.transcribe)}
            snapshot={activeSnapshot}
            onSend={sendMessage}
            onFollowUp={followUpMessage}
            onAnswer={answerMessage}
            onClose={() => setCallOpen(false)}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={null}>
        {memorySettingsOpen ? (
          <MemorySettingsOverlay
            onClose={() => setMemorySettingsOpen(false)}
            config={memoryProviderConfig}
            onConfigChange={(config) => {
              memoryProviderConfigRevision.current += 1;
              setMemoryProviderConfig(config);
            }}
          />
        ) : null}
      </Suspense>

      {booting ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-[22px] bg-[rgba(4,4,5,.96)]">
          <div className="text-[19px] font-medium text-[var(--rk-ink)]">
            <Trans>Booting up {active?.name}’s computer</Trans>
          </div>
          <div className="h-[5px] w-[min(420px,70%)] overflow-hidden rounded-full bg-[var(--rk-hover)]">
            <div className="h-full w-2/3 rounded-full bg-[var(--rk-solid)]" />
          </div>
        </div>
      ) : computerOpen && active ? (
        <div
          ref={computerOverlayRef}
          className="rk-computer-overlay absolute inset-0 z-30 flex h-full w-full flex-col bg-[var(--rk-page)]"
        >
          <div className="flex items-center justify-between gap-4 border-b border-[var(--rk-hairline)] px-[18px] py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <BotAvatar
                color={active.color}
                identity={active.id}
                size={28}
                status={liveStatusByBotId.get(active.id) ?? active.status}
              />
              {recordingSkill ? (
                <TeachRecordingChrome
                  recording={recordingSkill}
                  busy={teachBusy}
                  onStop={stopTeaching}
                  variant="overlay"
                />
              ) : (
                <span
                  className="truncate text-[15.5px] font-medium text-[var(--rk-ink)]"
                  dir="auto"
                >
                  {computerLabel(computer?.mode, active.name)}
                </span>
              )}
              {!recordingSkill && hasControl ? (
                <span className="rounded-full bg-[rgba(48,162,75,.14)] px-[11px] py-1 text-[13px] text-[#4ECB71]">
                  <Trans>You have control</Trans>
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              {composerRunning ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={t`Stop`}
                  data-testid="computer-overlay-stop"
                  onClick={() => void stopRun()}
                >
                  <Trans>Stop</Trans>
                </Button>
              ) : null}
              {recordingSkill ? (
                <TeachStopButton busy={teachBusy} onStop={stopTeaching} />
              ) : hasControl ? (
                <ComputerReleaseActions
                  takeoverRequested={computer?.takeoverRequested ?? false}
                  onRelease={releaseComputer}
                />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={takeoverBlocked}
                  title={takeoverBlocked ? t`Stop the bot first` : undefined}
                  onClick={() =>
                    void bootComputer({ takeControl: true, overlay: false }).catch(() => undefined)
                  }
                >
                  <Trans>Take control</Trans>
                </Button>
              )}
              <button
                type="button"
                className="text-[16px] text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
                aria-label={computerFullscreen ? t`Exit fullscreen` : t`Fullscreen`}
                aria-pressed={computerFullscreen}
                data-testid="computer-fullscreen"
                onClick={() => void toggleComputerFullscreen()}
              >
                {computerFullscreen ? (
                  <Minimize2 size={16} strokeWidth={1.8} />
                ) : (
                  <Maximize2 size={16} strokeWidth={1.8} />
                )}
              </button>
              <button
                type="button"
                className="text-[16px] text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
                aria-label={t`Close computer`}
                onClick={closeComputerOverlay}
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </div>
          </div>
          {sendError ? (
            <div
              role="alert"
              className="border-b border-[#5A2A2A] bg-[#2A1717] px-[18px] py-2 text-[13px] text-[#F1A8A8]"
            >
              {sendError}
            </div>
          ) : null}
          <div className="relative min-h-0 flex-1 bg-[var(--rk-main)]">
            {computer?.kind === "desktop" ? (
              <div className="grid h-full place-items-center px-8 text-center text-sm text-[var(--rk-muted-2)]">
                <Trans>
                  This bot runs on this computer. There is no separate Linux desktop. Ask it to use
                  the shell; working directories under your home folder are allowed.
                </Trans>
              </div>
            ) : computer?.state === "running" && embeddedScreenUrl ? (
              <>
                <iframe
                  title={t`Bot screen`}
                  src={embeddedScreenUrl}
                  sandbox={screenIframeSandbox(embeddedScreenUrl)}
                  className="h-full w-full border-0 bg-black"
                  allow="clipboard-read; clipboard-write; fullscreen"
                  style={{
                    pointerEvents: recordingSkill || !hasControl ? "none" : "auto",
                  }}
                />
                {active ? (
                  <TeachCaptureOverlay
                    botId={active.id}
                    skill={recordingSkill}
                    enabled={Boolean(recordingSkill)}
                    screenWidth={computer?.screenWidth}
                    screenHeight={computer?.screenHeight}
                  />
                ) : null}
              </>
            ) : (
              <div className="grid h-full place-items-center text-sm text-[var(--rk-muted-2)]">
                {computer?.state === "suspended"
                  ? t`Computer is asleep`
                  : computerLabel(computer?.mode, active.name)}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <AvatarStyleProvider value={bootstrapMe?.avatarStyle ?? "robot"}>{shell}</AvatarStyleProvider>
  );
}

const Transcript = memo(function Transcript({
  scrollRef,
  artifactTarget,
  messages,
  olderCursor,
  loadingOlder,
  answerableAskMessageId,
  running,
  workingBots,
  workingStartedAt,
  onLoadOlder,
  onOpenBot,
  onAnswer,
  onReply,
  onJumpToMessage,
  onOpenPeerMessages,
  memberName,
  peerBot,
  onRefresh,
  onBotChanged,
  onAddRoutine,
  voiceReady,
  speakingMessageId,
  onSpeak,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  artifactTarget: ArtifactTarget;
  messages: ThreadMessage[];
  olderCursor: number | null;
  loadingOlder: boolean;
  answerableAskMessageId: string | null;
  running: boolean;
  workingBots: GroupAvatarMember[];
  workingStartedAt?: number;
  onLoadOlder: () => void | Promise<void>;
  onOpenBot: (botId: string) => void;
  onAnswer: (message: ThreadMessage, text: string) => Promise<void>;
  onReply: (message: ThreadMessage) => void;
  onJumpToMessage: (messageId: string) => void;
  onOpenPeerMessages: (peerBotId: string) => void;
  memberName?: (botId: string | undefined) => string | undefined;
  peerBot: (botId: string) => { color: string; status?: string } | undefined;
  onRefresh: () => Promise<void>;
  onBotChanged: () => Promise<void>;
  onAddRoutine: (name: string, prompt: string) => void;
  voiceReady: boolean;
  speakingMessageId: string | null;
  onSpeak: (message: ThreadMessage) => void;
}) {
  const { t } = useLingui();
  const [atEnd, setAtEnd] = useState(true);
  const following = useRef(true);
  const autoScrolling = useRef(false);
  const lastScrollTop = useRef(0);
  const autoScrollTimer = useRef<number | undefined>(undefined);
  const jumpButtonRef = useRef<HTMLButtonElement>(null);
  const messageById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );
  const workingBotName = workingBots.length === 1 ? workingBots[0]?.name : undefined;
  const workingLabel =
    workingBotName != null && workingBotName !== ""
      ? t`${workingBotName} is working`
      : t`Bots are working`;
  const snapToEnd = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    following.current = true;
    autoScrolling.current = false;
    setAtEnd(true);
    element.scrollTo({ top: element.scrollHeight, behavior: "auto" });
  }, [scrollRef]);

  const jumpToLatest = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    following.current = true;
    autoScrolling.current = !reducedMotion;
    setAtEnd(true);
    element.scrollTo({
      top: element.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
    window.clearTimeout(autoScrollTimer.current);
    // Fallback only: onScroll clears autoScrolling once near-end is reached.
    autoScrollTimer.current = window.setTimeout(
      () => {
        autoScrolling.current = false;
      },
      reducedMotion ? 0 : 2_000,
    );
  }, [scrollRef]);

  useLayoutEffect(() => {
    if (following.current) snapToEnd();
  }, [messages, running, snapToEnd]);

  useLayoutEffect(() => {
    const button = jumpButtonRef.current;
    if (atEnd && button && document.activeElement === button) {
      button.blur();
    }
  }, [atEnd]);

  const loadOlder = useCallback(() => {
    const wasFollowing = following.current;
    // Prepend must not race the messages-driven snap-to-end follow path.
    following.current = false;
    autoScrolling.current = false;
    const pending = onLoadOlder();
    if (!pending) return;
    return Promise.resolve(pending).catch((error) => {
      const element = scrollRef.current;
      if (wasFollowing && element && transcriptIsNearEnd(element)) {
        following.current = true;
        setAtEnd(true);
      }
      throw error;
    });
  }, [onLoadOlder, scrollRef]);

  useEffect(
    () => () => {
      window.clearTimeout(autoScrollTimer.current);
    },
    [],
  );

  return (
    <div className="relative flex min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-testid="transcript"
        onPointerDown={() => {
          autoScrolling.current = false;
          following.current = false;
        }}
        onTouchStart={() => {
          autoScrolling.current = false;
          following.current = false;
        }}
        onWheel={(event) => {
          if (event.deltaY < 0) {
            autoScrolling.current = false;
            following.current = false;
          }
        }}
        onScroll={(event) => {
          const scrolledDown = event.currentTarget.scrollTop >= lastScrollTop.current;
          lastScrollTop.current = event.currentTarget.scrollTop;
          const nearEnd = transcriptIsNearEnd(event.currentTarget);
          setAtEnd(nearEnd);
          if (nearEnd) {
            if (scrolledDown) following.current = true;
            if (autoScrolling.current) {
              autoScrolling.current = false;
              window.clearTimeout(autoScrollTimer.current);
            }
          } else if (!autoScrolling.current) {
            following.current = false;
          }
        }}
        className="rk-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-5 md:px-7 md:py-6"
      >
        {olderCursor != null ? (
          <button
            type="button"
            disabled={loadingOlder}
            onClick={() => void loadOlder()}
            className="self-center rounded-lg px-3 py-1.5 text-[13px] text-[var(--rk-muted)] hover:bg-[var(--rk-surface-2)] hover:text-[var(--rk-body)] disabled:opacity-50"
          >
            {loadingOlder ? t`Loading…` : t`Load earlier messages`}
          </button>
        ) : null}
        {messages.map((message) => (
          <div
            key={message.id}
            data-message-id={message.id}
            className="group/message relative pt-9 hover:z-20"
          >
            <MessageHoverActions message={message} onReply={onReply} />
            <MessageView
              artifactTarget={artifactTarget}
              message={message}
              canAnswer={message.id === answerableAskMessageId}
              onOpenBot={onOpenBot}
              onOpenPeerMessages={onOpenPeerMessages}
              onAnswer={onAnswer}
              speakerName={message.role === "bot" ? memberName?.(message.botId) : undefined}
              memberName={memberName}
              peerBot={peerBot}
              replyPreview={
                message.replyToMessageId ? messageById.get(message.replyToMessageId) : undefined
              }
              replyToMessageId={message.replyToMessageId}
              onJumpToMessage={onJumpToMessage}
              onRefresh={onRefresh}
              onBotChanged={onBotChanged}
              onAddRoutine={onAddRoutine}
              voiceReady={voiceReady}
              speaking={speakingMessageId === message.id}
              onSpeak={() => onSpeak(message)}
            />
          </div>
        ))}
        {running &&
        !messages.some(
          (message) =>
            message.id.startsWith("progress:") &&
            message.blocks[0]?.kind === "progress" &&
            message.blocks[0].text,
        ) ? (
          <ActiveBotGlyph bots={workingBots} label={workingLabel} startedAt={workingStartedAt} />
        ) : null}
      </div>
      <button
        ref={jumpButtonRef}
        type="button"
        aria-label={t`Jump to latest`}
        aria-hidden={atEnd}
        tabIndex={atEnd ? -1 : 0}
        onClick={jumpToLatest}
        className={`absolute bottom-4 left-1/2 z-20 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)]/95 text-[var(--rk-body)] shadow-[0_8px_24px_rgba(0,0,0,.45)] backdrop-blur transition-[opacity,transform,background-color] duration-200 ease-[cubic-bezier(.22,1,.36,1)] hover:bg-[var(--rk-hover)] motion-reduce:transition-none ${
          atEnd ? "pointer-events-none translate-y-2 opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <ArrowDown size={17} strokeWidth={1.8} />
      </button>
    </div>
  );
});

const Composer = memo(function Composer({
  activeName,
  running,
  disabled,
  pendingAttachments,
  attachmentNotice,
  sendError,
  dictationError,
  sending,
  fileInputRef,
  onAttachmentPick,
  onRemoveAttachment,
  onSend,
  onStop,
  replyTarget,
  replyTargetName,
  onClearReply,
  mentionTargets,
  agentSkills,
  onSlashOpen,
  onSlashAction,
  dictating,
  transcribe,
  onDictateStart,
  onDictateStop,
}: {
  activeName?: string;
  running: boolean;
  disabled?: boolean;
  pendingAttachments: PendingAttachment[];
  attachmentNotice: string | null;
  sendError: string | null;
  dictationError: string | null;
  sending: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAttachmentPick: (files: ArrayLike<File> | null) => void | Promise<void>;
  onRemoveAttachment: (attachment: PendingAttachment) => void;
  onSend: (text: string, mentions?: ComposerMention[]) => Promise<void>;
  onStop: () => Promise<void>;
  replyTarget?: ThreadMessage | null;
  replyTargetName?: string;
  onClearReply?: () => void;
  mentionTargets?: ComposerMention[];
  agentSkills?: AgentSkillCatalogEntry[];
  onSlashOpen?: () => void;
  onSlashAction?: (action: SlashActionId) => void;
  dictating: boolean;
  transcribe: boolean;
  onDictateStart: (onFinal: (text: string) => void) => void;
  onDictateStop: () => void;
}) {
  const { t } = useLingui();
  const [draft, setDraft] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<AgentSkillCatalogEntry | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<ComposerMention[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend =
    draft.trim().length > 0 ||
    selectedSkill !== null ||
    selectedMentions.length > 0 ||
    pendingAttachments.length > 0;

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    function syncHeight() {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = "0px";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }

    syncHeight();
    let lastWidth = el.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const width = textarea.getBoundingClientRect().width;
      if (width === lastWidth) return;
      lastWidth = width;
      syncHeight();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [draft]);

  function updateDraft(value: string) {
    setDraft(value);
    const mentionMatch = /(?:^|\s)@([\w-]*)$/.exec(value);
    setMentionQuery(mentionMatch ? (mentionMatch[1] ?? "") : null);
    // `/` only at the start of the draft so forced skills expand (`Use skill:` / `/Name` prefix).
    const slashMatch = selectedSkill === null ? /^\/([^\n]*)$/.exec(value) : null;
    const nextSlash = slashMatch ? (slashMatch[1] ?? "") : null;
    if (nextSlash !== null && slashQuery === null) onSlashOpen?.();
    setSlashQuery(nextSlash);
  }

  function insertMention(mention: ComposerMention) {
    setDraft((current) => current.replace(/@([\w-]*)$/, ""));
    setMentionQuery(null);
    setSelectedMentions((current) =>
      current.some((selected) => mentionChipKey(selected) === mentionChipKey(mention))
        ? current
        : [...current, mention],
    );
  }

  function insertSkill(skill: AgentSkillCatalogEntry) {
    setSelectedSkill(skill);
    setDraft("");
    setSlashQuery(null);
  }

  function runSlashAction(action: SlashActionId) {
    setDraft("");
    setSlashQuery(null);
    onSlashAction?.(action);
  }

  function removeLastChip() {
    if (selectedMentions.length > 0) {
      setSelectedMentions((current) => current.slice(0, -1));
      return;
    }
    if (selectedSkill) setSelectedSkill(null);
  }

  const mentionOptions = useMemo(() => {
    if (mentionQuery === null || !mentionTargets?.length) return [];
    const query = mentionQuery.trim().toLowerCase();
    return mentionTargets
      .filter((target) => !query || target.name.toLowerCase().startsWith(query))
      .slice(0, 10);
  }, [mentionQuery, mentionTargets]);

  const slashSkillOptions = useMemo(() => {
    if (slashQuery === null) return [];
    const query = slashQuery.trim().toLowerCase();
    const skills = agentSkills ?? [];
    return skills
      .filter((skill) => {
        if (!query) return true;
        return (
          skill.name.toLowerCase().includes(query) ||
          skill.description.toLowerCase().includes(query)
        );
      })
      .slice(0, 8);
  }, [agentSkills, slashQuery]);

  const slashActionOptions = useMemo(() => {
    if (slashQuery === null) return [];
    const query = slashQuery.trim().toLowerCase();
    return SLASH_ACTIONS.filter((action) => !query || action.label.toLowerCase().includes(query));
  }, [slashQuery]);

  const showSlashPicker =
    slashQuery !== null &&
    mentionQuery === null &&
    (slashSkillOptions.length > 0 || slashActionOptions.length > 0);

  function send() {
    if (!canSend || sending || disabled) return;
    const text = serializeComposerPrompt(draft, selectedSkill, selectedMentions);
    setDraft("");
    setMentionQuery(null);
    setSlashQuery(null);
    setSelectedSkill(null);
    const mentions = selectedMentions;
    setSelectedMentions([]);
    void onSend(text, mentions);
  }

  const showComposerPlaceholder =
    draft.length === 0 && selectedSkill === null && selectedMentions.length === 0;
  const replyName = replyTarget ? (replyTargetName ?? previewMessageText(replyTarget)) : "";

  function attachFromClipboard(event: ClipboardEvent<HTMLElement> | DragEvent<HTMLElement>) {
    if (disabled) return;
    const data = "clipboardData" in event ? event.clipboardData : event.dataTransfer;
    const files = filesFromDataTransfer(data);
    if (!files.length) return;
    event.preventDefault();
    void onAttachmentPick(files);
  }

  return (
    <div className="relative z-30 px-3 pb-4 pt-3 md:px-6 md:pb-6">
      {sendError || dictationError ? (
        <div className="mb-3 rounded-[14px] border border-[#5A2A2A] bg-[#2A1717] px-4 py-2 text-[13px] text-[#F1A8A8]">
          {sendError ?? dictationError}
        </div>
      ) : null}
      {replyTarget ? (
        <div
          data-testid="reply-chip"
          className="mb-2 flex items-center gap-2 rounded-full border border-[var(--rk-hairline-strong)] bg-[var(--rk-solid-ink)] px-3 py-1.5 text-[13px] text-[var(--rk-body)]"
        >
          <span className="min-w-0 flex-1 truncate text-[var(--rk-muted)]">{t`Replying to ${replyName}`}</span>
          <button
            type="button"
            aria-label={t`Cancel reply`}
            onClick={onClearReply}
            className="shrink-0 text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>
      ) : null}
      {attachmentNotice ? (
        <div className="mb-3 rounded-[14px] border border-[#3A3A20] bg-[#232316] px-4 py-2 text-[13px] text-[#D6CFA0]">
          {attachmentNotice}
        </div>
      ) : null}
      {pendingAttachments.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {pendingAttachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded-full border border-[var(--rk-hairline-strong)] bg-[var(--rk-solid-ink)] px-3 py-1.5 text-[13px] text-[var(--rk-body)]"
            >
              {attachment.previewUrl ? (
                <img
                  src={attachment.previewUrl}
                  alt={attachment.file.name}
                  className="h-8 w-8 rounded object-cover"
                />
              ) : (
                <Paperclip size={14} strokeWidth={1.8} />
              )}
              <span className="max-w-[180px] truncate" dir="auto">
                {attachment.file.name}
              </span>
              <button
                type="button"
                aria-label={t`Remove ${attachment.file.name}`}
                onClick={() => onRemoveAttachment(attachment)}
                className="text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {mentionOptions.length ? (
        <div
          data-testid="mention-picker"
          className="mb-2 overflow-hidden rounded-[14px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-solid-ink)]"
        >
          {mentionOptions.map((mention) => (
            <button
              key={mentionChipKey(mention)}
              type="button"
              aria-label={t`@${mention.name}`}
              onClick={() => insertMention(mention)}
              className="flex w-full items-start gap-3 px-4 py-2.5 text-start hover:bg-[var(--rk-hover)]"
            >
              <MentionOptionIcon mention={mention} />
              <span className="min-w-0">
                <span dir="auto" className="block text-[14px] text-[var(--rk-ink)]">
                  @{mention.name}
                </span>
                {mention.subtitle ? (
                  <span dir="auto" className="block truncate text-[12.5px] text-[var(--rk-muted)]">
                    {mention.subtitle}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {showSlashPicker ? (
        <div
          data-testid="slash-picker"
          className="mb-2 overflow-hidden rounded-[14px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-solid-ink)]"
        >
          {slashSkillOptions.map((skill) => (
            <button
              key={skill.id}
              type="button"
              aria-label={t`Skill ${skill.name}`}
              onClick={() => insertSkill(skill)}
              className="flex w-full items-start gap-3 px-4 py-2.5 text-start hover:bg-[var(--rk-hover)]"
            >
              <Box size={16} strokeWidth={1.7} className="mt-0.5 shrink-0 text-[var(--rk-muted)]" />
              <span className="min-w-0">
                <span dir="auto" className="block text-[14px] text-[var(--rk-ink)]">
                  {skill.name}
                </span>
                <span dir="auto" className="block truncate text-[12.5px] text-[var(--rk-muted)]">
                  {truncateSlashDescription(skill.description)}
                </span>
              </span>
            </button>
          ))}
          {slashActionOptions.map((action) => {
            const label = slashActionLabel(action.id);
            return (
              <button
                key={action.id}
                type="button"
                aria-label={label}
                onClick={() => runSlashAction(action.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-[var(--rk-hover)]"
              >
                <Settings size={16} strokeWidth={1.7} className="shrink-0 text-[var(--rk-muted)]" />
                <span className="text-[14px] text-[var(--rk-ink)]">{label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        className={`flex items-end gap-3.5 rounded-full border bg-[var(--rk-hover)] py-[9px] pe-2.5 ps-3 ${
          dropActive ? "border-[var(--rk-ink)]" : "border-[var(--rk-hairline-strong)]"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void onAttachmentPick(event.target.files)}
        />
        <button
          type="button"
          aria-label={t`Attach file`}
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-[var(--rk-hairline-strong)] text-[var(--rk-muted)] disabled:opacity-40"
        >
          <Plus size={17} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label={dictating ? t`Stop dictation` : t`Dictate`}
          onMouseDown={(event) => {
            event.preventDefault();
            onDictateStart((text) => setDraft((current) => `${current} ${text}`.trim()));
          }}
          onMouseUp={onDictateStop}
          onMouseLeave={() => {
            if (dictating) onDictateStop();
          }}
          onTouchStart={(event) => {
            event.preventDefault();
            onDictateStart((text) => setDraft((current) => `${current} ${text}`.trim()));
          }}
          onTouchEnd={onDictateStop}
          className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border ${
            dictating
              ? "border-[#4ECB71] bg-[rgba(48,162,75,.16)] text-[#4ECB71]"
              : "border-[var(--rk-hairline-strong)] text-[var(--rk-muted)]"
          }`}
          title={transcribe ? t`Hold to talk` : t`Hold to talk (on-device dictation)`}
        >
          <Mic size={16} strokeWidth={1.8} />
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-1.5">
          {selectedSkill ? (
            <span
              data-testid="skill-chip"
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--rk-surface-2)] px-2.5 py-1 text-[13px] text-[var(--rk-ink)]"
            >
              <Box size={13} strokeWidth={1.7} className="shrink-0 text-[var(--rk-muted)]" />
              <span dir="auto" className="truncate">
                {selectedSkill.name}
              </span>
              <button
                type="button"
                aria-label={t`Remove skill ${selectedSkill.name}`}
                onClick={() => setSelectedSkill(null)}
                className="text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ) : null}
          {selectedMentions.map((mention) => (
            <span
              key={mentionChipKey(mention)}
              data-testid="mention-chip"
              data-mention-kind={mention.kind}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--rk-surface-2)] px-2.5 py-1 text-[13px] text-[var(--rk-ink)]"
            >
              <MentionChipIcon mention={mention} />
              <span dir="auto" className="truncate">
                {mention.name}
              </span>
              <button
                type="button"
                aria-label={t`Remove mention ${mention.name}`}
                onClick={() =>
                  setSelectedMentions((current) =>
                    current.filter(
                      (selected) => mentionChipKey(selected) !== mentionChipKey(mention),
                    ),
                  )
                }
                className="text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
              >
                <X size={12} strokeWidth={2} />
              </button>
            </span>
          ))}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => updateDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Backspace" &&
                draft.length === 0 &&
                (selectedSkill !== null || selectedMentions.length > 0)
              ) {
                event.preventDefault();
                removeLastChip();
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            disabled={disabled}
            placeholder={
              showComposerPlaceholder
                ? activeName
                  ? t`Message ${activeName}`
                  : t`Message…`
                : undefined
            }
            aria-label={activeName ? t`Message ${activeName}` : t`Message`}
            name="chat-message"
            autoComplete="off"
            dir="auto"
            rows={1}
            onPaste={(event) => {
              attachFromClipboard(event);
            }}
            onDragOver={(event) => {
              const transfer = event.dataTransfer;
              if (disabled || !transfer || !Array.from(transfer.types).includes("Files")) return;
              event.preventDefault();
              transfer.dropEffect = "copy";
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDropActive(false);
              attachFromClipboard(event);
            }}
            className="max-h-32 min-h-[24px] min-w-[8rem] flex-1 resize-none overflow-y-auto bg-transparent py-0.5 text-[15.5px] leading-6 text-[var(--rk-ink)] outline-none disabled:opacity-40"
          />
        </div>
        {running ? (
          <button
            type="button"
            aria-label={t`Stop`}
            onClick={() => void onStop()}
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--rk-solid)] text-[var(--rk-solid-ink)]"
          >
            <Square size={12} strokeWidth={0} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t`Send`}
            disabled={sending || !canSend || disabled}
            onClick={send}
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--rk-solid)] text-[var(--rk-solid-ink)] disabled:opacity-50"
          >
            <ArrowUp size={18} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
});

function slashActionLabel(id: SlashActionId) {
  switch (id) {
    case "chat-settings":
      return t`Chat Settings`;
    case "settings-general":
      return t`Settings: General`;
    case "settings-usage":
      return t`Settings: Usage`;
  }
}

function MentionOptionIcon({ mention }: { mention: ComposerMention }) {
  if (mention.kind === "routine") {
    return <Clock size={16} strokeWidth={1.7} className="mt-0.5 shrink-0 text-[var(--rk-muted)]" />;
  }
  if (mention.kind === "connector") {
    return (
      <Puzzle size={16} strokeWidth={1.7} className="mt-0.5 shrink-0 text-[var(--rk-muted)]" />
    );
  }
  if (mention.kind === "group") {
    return (
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--rk-surface-2)] text-[9px] text-[var(--rk-body)]">
        G
      </span>
    );
  }
  if (mention.kind === "everyone") {
    return (
      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--rk-surface-2)] text-[9px] text-[var(--rk-body)]">
        @
      </span>
    );
  }
  return <BotAvatar color={mention.color ?? "var(--rk-muted)"} identity={mention.id} size={16} />;
}

function MentionChipIcon({ mention }: { mention: ComposerMention }) {
  if (mention.kind === "routine") {
    return <Clock size={13} strokeWidth={1.7} className="shrink-0 text-[var(--rk-muted)]" />;
  }
  if (mention.kind === "connector") {
    return <Puzzle size={13} strokeWidth={1.7} className="shrink-0 text-[var(--rk-muted)]" />;
  }
  if (mention.kind === "group" || mention.kind === "everyone") {
    return (
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[var(--rk-surface-2)] text-[9px] text-[var(--rk-body)]">
        {mention.kind === "group" ? "G" : "@"}
      </span>
    );
  }
  return <BotAvatar color={mention.color ?? "var(--rk-muted)"} identity={mention.id} size={16} />;
}

function previewMessageText(message: ThreadMessage): string {
  const text = message.blocks
    .map((block) => (block.kind === "text" ? block.text : ""))
    .filter(Boolean)
    .join(" ")
    .trim();
  if (text) return text;
  if (message.blocks.some((block) => block.kind === "image" || block.kind === "file")) {
    return t`Attachment`;
  }
  return t`Message`;
}

/** Plain message text for clipboard copy — text/ask/progress only, no chrome. */
function copyableMessageText(message: ThreadMessage): string {
  return message.blocks
    .map((block) => {
      if (block.kind === "text" || block.kind === "progress" || block.kind === "ask") {
        return block.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function MessageHoverActions({
  message,
  onReply,
}: {
  message: ThreadMessage;
  onReply: (message: ThreadMessage) => void;
}) {
  const { t } = useLingui();
  // Streaming progress bubbles keep hover free for selection / stop clicks.
  if (message.id.startsWith("progress:")) return null;

  function copyMessage() {
    const text = copyableMessageText(message);
    if (!text || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).catch(() => undefined);
  }

  return (
    <div
      data-testid="message-hover-actions"
      className="pointer-events-none absolute end-0 top-0 z-10 flex items-center gap-0.5 rounded-full bg-[var(--rk-surface-2)] p-0.5 opacity-0 shadow-[0_1px_4px_rgba(0,0,0,0.45)] transition-opacity group-hover/message:pointer-events-auto group-hover/message:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100"
    >
      <button
        type="button"
        aria-label={t`Reply`}
        onClick={() => onReply(message)}
        className="grid h-7 w-7 place-items-center rounded-full text-[var(--rk-body)] hover:bg-[var(--rk-hairline-strong)] hover:text-[var(--rk-ink)]"
      >
        <Reply size={14} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label={t`Copy`}
        onClick={copyMessage}
        className="grid h-7 w-7 place-items-center rounded-full text-[var(--rk-body)] hover:bg-[var(--rk-hairline-strong)] hover:text-[var(--rk-ink)]"
      >
        <Copy size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function firstThreadRoute(
  bots: readonly Pick<Bot, "id">[],
  groups: readonly Pick<Group, "id">[],
): string {
  if (bots[0]) return `/app/${bots[0].id}`;
  if (groups[0]) return `/app/g/${groups[0].id}`;
  return "/app";
}

function applyThreadEvent(
  event: ProductEvent,
  commitSnapshot: (next: ThreadSnapshot | null) => void,
  commitComputer: (next: ComputerStatus | null) => void,
  snapshotRef: MutableRefObject<ThreadSnapshot | null>,
  computerRef: MutableRefObject<ComputerStatus | null>,
) {
  if (isThreadSnapshotEvent(event)) {
    const next = reduceThreadSnapshot(snapshotRef.current, event);
    commitSnapshot(next);
  }
  if (isComputerStatusEvent(event)) {
    const next = reduceComputerStatus(computerRef.current, event);
    commitComputer(next);
  }
}

function ComputerReleaseActions({
  takeoverRequested,
  onRelease,
}: {
  takeoverRequested: boolean;
  onRelease: (reason?: ComputerReleaseReason) => Promise<void>;
}) {
  if (!takeoverRequested) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => void onRelease()}>
        <Trans>Release</Trans>
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void onRelease("skipped")}>
        <Trans>Skip</Trans>
      </Button>
      <Button type="button" size="sm" onClick={() => void onRelease("done")}>
        <Trans>I’m done</Trans>
      </Button>
    </div>
  );
}

function ToolSteps({
  steps,
  currentIndex,
}: {
  steps: Extract<ThreadMessage["blocks"][number], { kind: "steps" }>["steps"];
  currentIndex?: number;
}) {
  return (
    <div className="space-y-1.5">
      {steps.map((step, index) => {
        const isCurrent = index === currentIndex;
        return (
          <div key={index} className="flex items-center gap-2">
            <span
              className="text-[13px]"
              style={{
                color: isCurrent ? "#F5A03C" : "#4ECB71",
                animation: isCurrent ? "rkPulse 1.2s ease-in-out infinite" : undefined,
              }}
            >
              {isCurrent ? "◷" : "✓"}
            </span>
            <span
              className="truncate text-[14px]"
              style={{ color: isCurrent ? "var(--rk-body)" : "var(--rk-muted)" }}
            >
              {step.label}
              {step.count > 1 ? ` ×${step.count}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const MessageView = memo(function MessageView({
  artifactTarget,
  canAnswer,
  message,
  onAnswer,
  onOpenBot,
  onOpenPeerMessages,
  speakerName,
  memberName,
  peerBot,
  replyPreview,
  replyToMessageId,
  onJumpToMessage,
  onRefresh,
  onBotChanged,
  onAddRoutine,
  voiceReady,
  speaking,
  onSpeak,
}: {
  artifactTarget: ArtifactTarget;
  canAnswer: boolean;
  message: ThreadMessage;
  onAnswer: (message: ThreadMessage, text: string) => Promise<void>;
  onOpenBot: (botId: string) => void;
  onOpenPeerMessages: (peerBotId: string) => void;
  speakerName?: string;
  memberName?: (botId: string | undefined) => string | undefined;
  peerBot: (botId: string) => { color: string; status?: string } | undefined;
  replyPreview?: ThreadMessage;
  replyToMessageId?: string;
  onJumpToMessage?: (messageId: string) => void;
  onRefresh: () => Promise<void>;
  onBotChanged: () => Promise<void>;
  onAddRoutine: (name: string, prompt: string) => void;
  voiceReady: boolean;
  speaking: boolean;
  onSpeak: () => void;
}) {
  const { t } = useLingui();
  const isNarration =
    message.role === "bot" &&
    message.blocks.length > 0 &&
    message.blocks.every(
      (block) => block.kind === "text" || block.kind === "progress" || block.kind === "steps",
    );
  const isLive = message.id.startsWith("progress:");
  const parentJumpId = replyPreview?.id ?? replyToMessageId;
  const messageContext = (
    <>
      {speakerName ? (
        <div className="mb-1 text-[12.5px] font-medium text-[var(--rk-muted)]" dir="auto">
          {speakerName}
        </div>
      ) : null}
      {parentJumpId ? (
        <button
          type="button"
          data-testid="reply-parent-preview"
          aria-label={t`Jump to replied message`}
          onClick={() => onJumpToMessage?.(parentJumpId)}
          className="mb-2 block max-w-[74%] truncate rounded-[14px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-hover)] px-3 py-2 text-start text-[12.5px] text-[var(--rk-muted)] hover:border-[#34343B] hover:text-[var(--rk-body)]"
          dir="auto"
        >
          {replyPreview ? previewMessageText(replyPreview) : t`Earlier message`}
        </button>
      ) : null}
    </>
  );
  if (isNarration) {
    return (
      <>
        {messageContext}
        <div className="flex justify-start">
          <div
            className="max-w-[74%] space-y-2.5 rounded-[20px] bg-[var(--rk-surface-2)] px-[18px] py-3 text-[15.5px] leading-[1.5] text-[var(--rk-body)]"
            dir="auto"
          >
            {message.blocks.map((block, i) => {
              if (block.kind === "steps") {
                const isCurrentBlock = isLive && i === message.blocks.length - 1;
                return (
                  <div key={i} dir="ltr">
                    <ToolSteps
                      steps={block.steps}
                      currentIndex={isCurrentBlock ? block.steps.length - 1 : undefined}
                    />
                  </div>
                );
              }
              if (block.kind === "text" || block.kind === "progress") {
                return (
                  <div key={i}>
                    <ChatMarkdown streaming={block.kind === "progress"}>{block.text}</ChatMarkdown>
                  </div>
                );
              }
              return null;
            })}
            {!isLive && voiceReady && message.blocks.some((block) => block.kind === "text") ? (
              <button
                type="button"
                aria-label={speaking ? t`Stop speaking` : t`Speak this reply`}
                onClick={onSpeak}
                className="text-[12px] text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
              >
                {speaking ? <Trans>Stop</Trans> : <Trans>Speak</Trans>}
              </button>
            ) : null}
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      {messageContext}
      {message.blocks.map((block, i) => {
        if (block.kind === "handoff") {
          const from = memberName?.(block.fromBotId) ?? t`bot`;
          const to = memberName?.(block.toBotId) ?? t`bot`;
          return (
            <div
              key={i}
              className="flex items-center justify-center gap-2 py-1 text-[13.5px] text-[var(--rk-muted)]"
            >
              <span>
                ↪ {to} ← {from}
              </span>
              <span>{block.text}</span>
            </div>
          );
        }
        if (block.kind === "bot_message_sent" || block.kind === "bot_message_received") {
          const sent = block.kind === "bot_message_sent";
          const peer = sent ? block.toBotName : block.fromBotName;
          const peerBotId = sent ? block.toBotId : block.fromBotId;
          const label = sent ? t`Messaged ${peer}` : t`Message from ${peer}`;
          return (
            <CollaborationMarker
              key={i}
              ariaLabel={label}
              color={peerBot(peerBotId)?.color ?? "#85858A"}
              identity={peerBotId}
              label={label}
              onClick={() => onOpenPeerMessages(peerBotId)}
            />
          );
        }
        if (block.kind === "meta") {
          return (
            <div
              key={i}
              className="flex items-center justify-center gap-2 py-1 text-[13.5px] text-[var(--rk-muted)]"
            >
              <span className="text-[#E65707]">◷</span>
              <span>{block.text}</span>
            </div>
          );
        }
        if (block.kind === "progress") {
          return (
            <div key={i} className="flex justify-start">
              <div
                className="max-w-[74%] rounded-[20px] bg-[var(--rk-surface-2)] px-[18px] py-3 text-[15.5px] leading-[1.5] text-[var(--rk-body)]"
                dir="auto"
              >
                <ChatMarkdown streaming>{block.text}</ChatMarkdown>
              </div>
            </div>
          );
        }
        if (block.kind === "steps") {
          return (
            <div key={i} className="flex justify-start">
              <div
                className="max-w-[74%] space-y-1.5 rounded-[20px] bg-[var(--rk-surface-2)] px-[18px] py-3"
                dir="ltr"
              >
                <ToolSteps
                  steps={block.steps}
                  currentIndex={isLive ? block.steps.length - 1 : undefined}
                />
              </div>
            </div>
          );
        }
        if (block.kind === "subagent") {
          const running = block.status === "running";
          const failed = block.status === "failed";
          return (
            <div
              key={i}
              className="w-[min(420px,90%)] rounded-[18px] border border-[#232326] bg-[var(--rk-solid-ink)] px-[18px] py-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-medium text-[var(--rk-ink)]" dir="auto">
                  {block.name}
                </span>
                <span
                  className="rounded-full px-[11px] py-1 text-[13px]"
                  style={{
                    background: failed
                      ? "rgba(230,87,7,.14)"
                      : running
                        ? "rgba(245,160,60,.14)"
                        : "rgba(48,162,75,.14)",
                    color: failed ? "#E65707" : running ? "#F5A03C" : "#4ECB71",
                    animation: running ? "rkPulse 1.2s ease-in-out infinite" : undefined,
                  }}
                >
                  {running ? <Trans>subagent</Trans> : block.status}
                </span>
              </div>
              <div className="mt-2 text-[13.5px] text-[var(--rk-muted)]">{block.task}</div>
              {block.progress || block.result ? (
                <div className="mt-2.5 text-[14.5px] leading-[1.5] text-[var(--rk-muted)]">
                  <ChatMarkdown streaming={running}>
                    {block.result || block.progress || ""}
                  </ChatMarkdown>
                </div>
              ) : null}
            </div>
          );
        }
        if (block.kind === "child_bot") {
          const removed = block.status === "deleted" || block.status === "archived";
          return (
            <button
              key={i}
              type="button"
              disabled={removed}
              onClick={() => onOpenBot(block.botId)}
              className="w-[min(340px,90%)] rounded-[18px] border border-[#232326] bg-[var(--rk-solid-ink)] px-[18px] py-4 text-start disabled:opacity-60"
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-[var(--rk-ink)]" dir="auto">
                  {block.name}
                </span>
                <span
                  className="rounded-full px-[11px] py-1 text-[13px]"
                  style={{
                    background: removed ? "rgba(230,87,7,.14)" : "rgba(48,162,75,.14)",
                    color: removed ? "#E65707" : "#4ECB71",
                  }}
                >
                  {block.status === "archived" ? (
                    <Trans>archived</Trans>
                  ) : block.status === "deleted" ? (
                    <Trans>deleted</Trans>
                  ) : (
                    <Trans>bot</Trans>
                  )}
                </span>
              </div>
              <div className="mt-2 text-[14.5px] leading-[1.5] text-[var(--rk-muted)]" dir="auto">
                {removed
                  ? block.status === "archived"
                    ? t`Archived. Chat, memory, and files kept.`
                    : t`Removed with chat, computer, and memory.`
                  : block.title || t`Opened its thread.`}
              </div>
            </button>
          );
        }
        if (block.kind === "choice") {
          const botId = "botId" in artifactTarget ? artifactTarget.botId : message.botId;
          if (!botId) return null;
          return <ChoiceCard key={i} botId={botId} block={block} onBotChanged={onBotChanged} />;
        }
        if (block.kind === "app_connect") {
          const botId = "botId" in artifactTarget ? artifactTarget.botId : message.botId;
          if (!botId) return null;
          return (
            <div key={i} className="flex justify-start">
              <AppConnectCard botId={botId} block={block} />
            </div>
          );
        }
        if (block.kind === "chart") {
          return (
            <div key={i} className="flex justify-start">
              <ChartBlockView name={block.name} spec={block.spec} data={block.data} />
            </div>
          );
        }
        if (block.kind === "mcp_approval") {
          return (
            <div key={i} className="flex justify-start">
              <McpApprovalCard
                botId={"botId" in artifactTarget ? artifactTarget.botId : message.botId}
                name={block.name}
                serverId={block.serverId}
                transport={block.transport}
                endpoint={block.endpoint}
                needsOAuth={block.needsOAuth}
              />
            </div>
          );
        }
        if (block.kind === "image") {
          return (
            <div
              key={i}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <ArtifactImage
                target={artifactTarget}
                artifactId={block.artifactId}
                name={block.name}
              />
            </div>
          );
        }
        if (block.kind === "file") {
          return (
            <div
              key={i}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <ArtifactFileCard
                target={artifactTarget}
                artifactId={block.artifactId}
                name={block.name}
                mimeType={block.mimeType}
                size={block.size}
              />
            </div>
          );
        }
        if (block.kind === "text" && message.role === "user") {
          return (
            <div key={i} className="flex justify-end">
              <div
                className="max-w-[70%] rounded-[20px] bg-[var(--rk-solid)] px-[18px] py-3 text-[15.5px] leading-[1.45] text-[var(--rk-user-ink)]"
                dir="auto"
              >
                {block.text}
              </div>
            </div>
          );
        }
        if (block.kind === "text") {
          return (
            <div key={i} className="flex justify-start">
              <div
                className="max-w-[74%] rounded-[20px] bg-[var(--rk-surface-2)] px-[18px] py-3 text-[15.5px] leading-[1.5] text-[var(--rk-body)]"
                dir="auto"
              >
                <ChatMarkdown>{block.text}</ChatMarkdown>
                {voiceReady ? (
                  <button
                    type="button"
                    aria-label={speaking ? t`Stop speaking` : t`Speak this reply`}
                    onClick={onSpeak}
                    className="mt-2 text-[12px] text-[var(--rk-muted)] hover:text-[var(--rk-ink)]"
                  >
                    {speaking ? <Trans>Stop</Trans> : <Trans>Speak</Trans>}
                  </button>
                ) : null}
              </div>
            </div>
          );
        }
        if (block.kind === "card") {
          return (
            <div key={i} className="flex justify-start">
              <div className="flex flex-col gap-2 rounded-[20px] bg-[var(--rk-surface-2)] px-5 py-4">
                {block.lines.map((line) => (
                  <div key={line.k} className="flex items-baseline gap-2.5 text-[15px]">
                    <span className="text-[#30A24B]">✓</span>
                    <span className="font-semibold text-white">{line.k}</span>
                    <span className="text-[var(--rk-muted)]">→</span>
                    <span>{line.v}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        if (block.kind === "ask") {
          return (
            <AskCard
              key={i}
              block={block}
              canAnswer={canAnswer}
              onAnswer={(text) => onAnswer(message, text)}
            />
          );
        }
        if (block.kind === "skill_draft") {
          return (
            <div key={i} className="flex justify-start">
              <SkillDraftCard block={block} onRefresh={onRefresh} onAddRoutine={onAddRoutine} />
            </div>
          );
        }
        if (block.kind === "computer") {
          return (
            <div
              key={i}
              className="w-[340px] rounded-[18px] border border-[#232326] bg-[var(--rk-solid-ink)] px-[18px] py-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-[var(--rk-ink)]">
                  <Trans>Computer</Trans>
                </span>
                <span className="rounded-full bg-[rgba(48,162,75,.14)] px-[11px] py-1 text-[13px] text-[#4ECB71]">
                  {block.state}
                </span>
              </div>
              <div className="my-2.5 text-[14.5px] leading-[1.5] text-[var(--rk-muted)]">
                <ChatMarkdown>{block.text}</ChatMarkdown>
              </div>
            </div>
          );
        }
        return null;
      })}
    </>
  );
});

function ComputerModePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ComputerMode;
  onChange: (value: ComputerMode) => void;
  disabled?: boolean;
}) {
  const hintId = useId();
  return (
    <div className="mt-4">
      <div className="text-[14px] text-[var(--rk-muted)]">
        <Trans>Computer</Trans>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["team", "dedicated"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={value === mode}
            aria-describedby={hintId}
            disabled={disabled}
            onClick={() => onChange(mode)}
            className={`rounded-[11px] border px-3.5 py-3 text-[14px] capitalize disabled:opacity-40 ${
              value === mode
                ? "border-[var(--rk-muted-2)] bg-[var(--rk-surface-2)] text-[var(--rk-ink)]"
                : "border-[var(--rk-hairline-strong)] text-[var(--rk-muted)]"
            }`}
          >
            {mode === "team" ? <Trans>Team</Trans> : <Trans>Private</Trans>}
          </button>
        ))}
      </div>
      <p id={hintId} className="mt-2 text-[13px] leading-relaxed text-[var(--rk-muted-2)]">
        {value === "dedicated" ? (
          <Trans>Only this bot uses this computer.</Trans>
        ) : (
          <Trans>Shared with other bots. Switch to Private for this bot’s own computer.</Trans>
        )}
      </p>
    </div>
  );
}

function CreateBotForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: {
    name: string;
    title: string;
    description: string;
    computerMode: ComputerMode;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [computerMode, setComputerMode] = useState<ComputerMode>("team");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onCreate({ name, title, description, computerMode });
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not create bot`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[13.5px] text-[var(--rk-muted)]">
          <Trans>New bot</Trans>
        </span>
        <button type="button" aria-label={t`Cancel new bot`} onClick={onCancel}>
          <X size={16} strokeWidth={1.8} />
        </button>
      </div>
      {error ? (
        <p role="alert" data-testid="create-bot-error" className="mb-3 text-[13px] text-[#C94244]">
          {error}
        </p>
      ) : null}
      <label className="mt-6 block text-[14px] text-[var(--rk-muted)]">
        <Trans>Name</Trans>
        <input
          value={name}
          maxLength={BOT_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
          placeholder={t`Name this bot`}
          className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 text-[var(--rk-ink)]"
        />
      </label>
      <label className="mt-4 block text-[14px] text-[var(--rk-muted)]">
        <Trans>Title</Trans>
        <input
          value={title}
          maxLength={BOT_TITLE_MAX_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t`Describe what this bot does`}
          className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 text-[var(--rk-ink)]"
        />
      </label>
      <label className="mt-4 block text-[14px] text-[var(--rk-muted)]">
        <Trans>Description</Trans>
        <textarea
          value={description}
          maxLength={BOT_DESCRIPTION_MAX_LENGTH}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t`What this bot is for`}
          rows={4}
          className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 text-[var(--rk-ink)]"
        />
      </label>
      <ComputerModePicker value={computerMode} onChange={setComputerMode} />
      <button
        type="button"
        disabled={!name.trim() || submitting}
        onClick={() => void handleSubmit()}
        className="mt-5 rounded-[11px] bg-[var(--rk-solid)] px-4 py-2 text-[var(--rk-solid-ink)] disabled:opacity-40"
      >
        {submitting ? <Trans>Creating…</Trans> : <Trans>Create</Trans>}
      </button>
    </div>
  );
}

function BotSettings({
  bot,
  computer,
  memoryProviderConfigured,
  onSave,
  onExport,
  onClear,
  onComputerChanged,
}: {
  bot: Bot;
  computer: ComputerStatus | null;
  memoryProviderConfigured: boolean;
  onSave: (patch: {
    name?: string;
    title?: string;
    description?: string;
    instructions?: string;
    computerMode: ComputerMode;
    memoryScope?: "isolated" | "shared" | null;
    autoSpeak?: boolean;
    voiceId?: string | null;
    modelProvider?: string | null;
    modelId?: string | null;
    thinkingLevel?: ThinkingLevel | null;
  }) => Promise<void>;
  onExport: () => Promise<void>;
  onClear: () => void;
  onComputerChanged: () => Promise<void>;
}) {
  const { t } = useLingui();
  const [name, setName] = useState(bot.name);
  const [title, setTitle] = useState(bot.title);
  const [description, setDescription] = useState(bot.description);
  const [computerMode, setComputerMode] = useState(bot.computerMode);
  const [memoryScope, setMemoryScope] = useState(bot.memoryScope);
  const [autoSpeak, setAutoSpeak] = useState(bot.autoSpeak);
  const [voiceId, setVoiceId] = useState(bot.voiceId ?? "");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [modelKey, setModelKey] = useState(
    bot.modelProvider && bot.modelId ? modelOptionKey(bot.modelProvider, bot.modelId) : "",
  );
  const [thinkingLevel, setThinkingLevel] = useState(bot.thinkingLevel ?? "");
  const [credentials, setCredentials] = useState<ModelCredential[]>([]);
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [modelMetaReady, setModelMetaReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void rpc.voice
      .voices({})
      .then(setVoices)
      .catch(() => setVoices([]));
    void Promise.all([rpc.models.credentials(), rpc.models.list(), rpc.me()])
      .then(([nextCredentials, nextCatalog, nextMe]) => {
        setCredentials(nextCredentials);
        setCatalog(nextCatalog);
        setMe(nextMe);
        // Only mark ready on success — a failed catalog load must not clear
        // an existing thinkingLevel override on save.
        setModelMetaReady(true);
      })
      .catch(() => undefined);
  }, []);

  const connectedOptions: Array<{
    key: string;
    provider: string;
    modelId: string;
    label: string;
  }> = [];
  const seenOptions = new Set<string>();
  for (const credential of credentials) {
    const providerModels = catalog.filter(
      (entry) => entry.provider === credential.provider && !entry.placeholder,
    );
    const credentialInCatalog = Boolean(
      credential.modelId && providerModels.some((entry) => entry.id === credential.modelId),
    );
    // Catalog providers expand to every model for that connection. Free-form
    // credentials (model id not in the catalog) stay a single connected pair.
    const options =
      credential.modelId && !credentialInCatalog
        ? [
            {
              key: modelOptionKey(credential.provider, credential.modelId),
              provider: credential.provider,
              modelId: credential.modelId,
              label: `${credential.label} · ${credential.modelId}`,
            },
          ]
        : providerModels.map((entry) => ({
            key: modelOptionKey(entry.provider, entry.id),
            provider: entry.provider,
            modelId: entry.id,
            label: `${entry.providerName ?? entry.provider} · ${entry.label}`,
          }));
    for (const option of options) {
      if (seenOptions.has(option.key)) continue;
      seenOptions.add(option.key);
      connectedOptions.push(option);
    }
  }

  const effectiveProvider = modelKey
    ? parseModelOptionKey(modelKey)?.provider
    : (me?.defaultProvider ?? null);
  const effectiveModelId = modelKey
    ? parseModelOptionKey(modelKey)?.modelId
    : (me?.defaultModel ?? null);
  const effectiveEntry =
    effectiveProvider && effectiveModelId
      ? catalog.find(
          (entry) => entry.provider === effectiveProvider && entry.id === effectiveModelId,
        )
      : undefined;
  const thinkingOptions = (effectiveEntry?.thinkingLevels ?? []).filter((level) => level !== "off");

  return (
    <div data-testid="bot-settings">
      <div className="flex justify-center">
        <BotAvatar color={bot.color} identity={bot.id} size={64} status={bot.status} />
      </div>
      <label className="mt-6 block text-[14px] text-[var(--rk-muted)]">
        <Trans>Name</Trans>
        <input
          value={name}
          maxLength={BOT_NAME_MAX_LENGTH}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 text-[var(--rk-ink)]"
        />
      </label>
      <label className="mt-4 block text-[14px] text-[var(--rk-muted)]">
        <Trans>Title</Trans>
        <input
          value={title}
          maxLength={BOT_TITLE_MAX_LENGTH}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 text-[var(--rk-ink)]"
        />
      </label>
      <label className="mt-4 block text-[14px] text-[var(--rk-muted)]">
        <Trans>Description</Trans>
        <textarea
          value={description}
          maxLength={BOT_DESCRIPTION_MAX_LENGTH}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 text-[var(--rk-ink)]"
        />
      </label>
      <details data-testid="bot-settings-advanced" className="group mt-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] text-[var(--rk-muted)]">
          <span className="text-[var(--rk-muted)]">
            <Trans>Advanced</Trans>
          </span>
          <span aria-hidden="true" className="transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <ComputerModePicker value={computerMode} onChange={setComputerMode} />
        <Suspense fallback={null}>
          <ScratchpadSection botId={bot.id} />
        </Suspense>
        <label className="mt-4 block text-[14px] text-[var(--rk-muted)]">
          <Trans>Model</Trans>
          <select
            value={modelKey}
            onChange={(event) => {
              setModelKey(event.target.value);
              setThinkingLevel("");
            }}
            className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 text-[var(--rk-ink)]"
          >
            <option value="">
              {t`Workspace default`}
              {me?.defaultModel
                ? ` (${catalogLabel(catalog, me.defaultProvider, me.defaultModel) ?? me.defaultModel})`
                : ""}
            </option>
            {modelKey && !connectedOptions.some((option) => option.key === modelKey) ? (
              <option value={modelKey}>{parseModelOptionKey(modelKey)?.modelId ?? modelKey}</option>
            ) : null}
            {connectedOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {thinkingOptions.length ? (
          <label className="mt-4 block text-[14px] text-[var(--rk-muted)]">
            <Trans>Thinking</Trans>
            <select
              value={thinkingLevel}
              onChange={(event) => setThinkingLevel(event.target.value)}
              className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 text-[var(--rk-ink)]"
            >
              <option value="">{t`Default (medium)`}</option>
              {thinkingOptions.map((level) => (
                <option key={level} value={level}>
                  {thinkingLevelLabel(level)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {memoryProviderConfigured ? (
          <div className="mt-4 text-[14px] text-[var(--rk-muted)]">
            <Trans>Memory scope</Trans>
            <div className="mt-2 flex gap-2">
              {(
                [
                  { value: null, label: t`Inherit default` },
                  { value: "isolated" as const, label: t`Isolated` },
                  { value: "shared" as const, label: t`Shared` },
                ] satisfies Array<{ value: "isolated" | "shared" | null; label: string }>
              ).map((option) => (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={memoryScope === option.value}
                  onClick={() => setMemoryScope(option.value)}
                  className={`flex-1 rounded-[11px] border px-3 py-2 text-[13px] ${
                    memoryScope === option.value
                      ? "border-[#4A4A50] bg-[var(--rk-surface-2)] text-[var(--rk-ink)]"
                      : "border-[var(--rk-hairline-strong)] text-[var(--rk-muted)]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <label className="mt-5 flex cursor-pointer items-center gap-3 text-[14px] text-[var(--rk-body)]">
          <input
            type="checkbox"
            checked={autoSpeak}
            onChange={(event) => setAutoSpeak(event.target.checked)}
          />
          <Trans>Read replies aloud</Trans>
        </label>
        {voices.length ? (
          <label className="mt-4 block text-[14px] text-[var(--rk-muted)]">
            <Trans>Voice</Trans>
            <select
              value={voiceId}
              onChange={(event) => setVoiceId(event.target.value)}
              className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 text-[var(--rk-ink)]"
            >
              <option value="">{t`Account default`}</option>
              {voices.map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </details>
      {error ? <p className="mt-2 text-[13px] text-[#E65707]">{error}</p> : null}
      <div className="mt-5 flex flex-col items-start gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setSaving(true);
            setError(null);
            const selected = modelKey ? parseModelOptionKey(modelKey) : null;
            void onSave({
              name,
              title,
              description,
              instructions: description,
              computerMode,
              memoryScope,
              autoSpeak,
              voiceId: voiceId || null,
              modelProvider: selected?.provider ?? null,
              modelId: selected?.modelId ?? null,
              // Only clear thinking when catalog metadata is available; otherwise
              // preserve the stored override if models.list failed or is still loading.
              ...(modelMetaReady
                ? {
                    thinkingLevel: thinkingOptions.length
                      ? ((thinkingLevel || null) as ThinkingLevel | null)
                      : null,
                  }
                : {}),
            })
              .catch((err) => setError(err instanceof Error ? err.message : t`Could not save`))
              .finally(() => setSaving(false));
          }}
          className="rounded-[11px] bg-[var(--rk-solid)] px-4 py-2 text-[var(--rk-solid-ink)] disabled:opacity-40"
        >
          <Trans>Save</Trans>
        </button>
        <button
          type="button"
          onClick={() => void onExport()}
          className="text-[14px] text-[var(--rk-muted)]"
        >
          <Trans>Export</Trans>
        </button>
        <button type="button" onClick={onClear} className="text-[14px] text-[#E65707]">
          <Trans>Clear conversation</Trans>
        </button>
        <ComputerMaintenanceActions
          botId={bot.id}
          computer={computer}
          onChanged={onComputerChanged}
        />
      </div>
    </div>
  );
}

function modelOptionKey(provider: string, modelId: string) {
  return `${provider}::${modelId}`;
}

function thinkingLevelLabel(level: ThinkingLevel) {
  if (level === "xhigh") return t`Extra high`;
  if (level === "low") return t`Low`;
  if (level === "medium") return t`Medium`;
  if (level === "high") return t`High`;
  if (level === "minimal") return t`Minimal`;
  if (level === "max") return t`Max`;
  return `${level.slice(0, 1).toUpperCase()}${level.slice(1)}`;
}

function parseModelOptionKey(key: string) {
  const separator = key.indexOf("::");
  if (separator <= 0) return null;
  return { provider: key.slice(0, separator), modelId: key.slice(separator + 2) };
}

function catalogLabel(
  catalog: ModelCatalogEntry[],
  provider: string | null | undefined,
  modelId: string,
) {
  if (!provider) return undefined;
  return catalog.find((entry) => entry.provider === provider && entry.id === modelId)?.label;
}

function NewBotSectionDialog({
  bot,
  onCancel,
  onConfirm,
}: {
  bot: Bot;
  onCancel: () => void;
  onConfirm: (name: string) => Promise<void>;
}) {
  const { t } = useLingui();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, saving]);

  return (
    <div
      role="presentation"
      className="absolute inset-0 z-50 grid place-items-center bg-[rgba(4,4,5,.76)] px-5"
      onPointerDown={() => {
        if (!saving) onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-bot-section-title"
        className="w-full max-w-[420px] rounded-[18px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)] p-5 shadow-[0_24px_70px_rgba(0,0,0,.65)]"
        onPointerDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed || saving) return;
          setSaving(true);
          setError(null);
          void onConfirm(trimmed).catch((err: unknown) => {
            setError(err instanceof Error ? err.message : t`Could not create section`);
            setSaving(false);
          });
        }}
      >
        <h2 id="new-bot-section-title" className="text-[17px] font-medium text-[var(--rk-ink)]">
          <Trans>New section</Trans>
        </h2>
        <p className="mt-2 text-[14px] leading-6 text-[var(--rk-muted)]">
          <Trans>Create a section and move {bot.name} into it.</Trans>
        </p>
        <label className="mt-4 block text-[13.5px] text-[var(--rk-body)]">
          <Trans>Name</Trans>
          <input
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-input)] px-3.5 py-2.5 text-[14.5px] text-[var(--rk-ink)] outline-none focus:border-[#66666D]"
          />
        </label>
        {error ? <p className="mt-3 text-[13.5px] text-[#FF5364]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded-[10px] px-3.5 py-2 text-[14px] text-[var(--rk-body)] hover:bg-[#29292D] disabled:opacity-40"
          >
            <Trans>Cancel</Trans>
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-[10px] bg-[var(--rk-solid)] px-3.5 py-2 text-[14px] font-medium text-[var(--rk-solid-ink)] disabled:opacity-40"
          >
            {saving ? <Trans>Creating…</Trans> : <Trans>Create</Trans>}
          </button>
        </div>
      </form>
    </div>
  );
}

function ClearConversationDialog({
  bot,
  onCancel,
  onConfirm,
}: {
  bot: Bot;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useLingui();
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !clearing) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearing, onCancel]);

  return (
    <div
      role="presentation"
      className="absolute inset-0 z-50 grid place-items-center bg-[rgba(4,4,5,.76)] px-5"
      onPointerDown={() => {
        if (!clearing) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-conversation-title"
        aria-describedby="clear-conversation-description"
        className="w-full max-w-[420px] rounded-[18px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)] p-5 shadow-[0_24px_70px_rgba(0,0,0,.65)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2 id="clear-conversation-title" className="text-[17px] font-medium text-[var(--rk-ink)]">
          <Trans>Clear {bot.name}’s conversation?</Trans>
        </h2>
        <p
          id="clear-conversation-description"
          className="mt-2 text-[14px] leading-6 text-[var(--rk-muted)]"
        >
          <Trans>
            This permanently removes every message and stops current work. The bot, computer,
            memory, and routines are kept.
          </Trans>
        </p>
        {error ? <p className="mt-3 text-[13.5px] text-[#FF5364]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={clearing}
            onClick={onCancel}
            className="rounded-[10px] px-3.5 py-2 text-[14px] text-[var(--rk-body)] hover:bg-[#29292D] disabled:opacity-40"
          >
            <Trans>Cancel</Trans>
          </button>
          <button
            type="button"
            disabled={clearing}
            onClick={() => {
              setClearing(true);
              setError(null);
              void onConfirm().catch((err: unknown) => {
                setError(err instanceof Error ? err.message : t`Could not clear conversation`);
                setClearing(false);
              });
            }}
            className="rounded-[10px] bg-[#FF5364] px-3.5 py-2 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {clearing ? <Trans>Clearing…</Trans> : <Trans>Clear</Trans>}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteBotDialog({
  bot,
  onCancel,
  onConfirm,
}: {
  bot: Bot;
  onCancel: () => void;
  onConfirm: (deleteMemories: boolean) => Promise<void>;
}) {
  const { t } = useLingui();
  const [deleting, setDeleting] = useState(false);
  const [deleteMemories, setDeleteMemories] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleting, onCancel]);

  return (
    <div
      role="presentation"
      className="absolute inset-0 z-50 grid place-items-center bg-[rgba(4,4,5,.76)] px-5"
      onPointerDown={() => {
        if (!deleting) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-bot-title"
        aria-describedby="delete-bot-description"
        className="w-full max-w-[420px] rounded-[18px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)] p-5 shadow-[0_24px_70px_rgba(0,0,0,.65)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2 id="delete-bot-title" className="text-[17px] font-medium text-[var(--rk-ink)]">
          <Trans>Delete {bot.name}?</Trans>
        </h2>
        <p
          id="delete-bot-description"
          className="mt-2 text-[14px] leading-6 text-[var(--rk-muted)]"
        >
          <Trans>
            Its conversation, files, and routines will be permanently deleted. Bots it created stay
            in your list.
          </Trans>
        </p>
        <fieldset className="mt-4 space-y-2">
          <legend className="mb-2 text-[13.5px] text-[var(--rk-body)]">
            <Trans>What about its memories?</Trans>
          </legend>
          <label className="flex cursor-pointer gap-3 rounded-[11px] border border-[var(--rk-hairline-strong)] p-3">
            <input
              type="radio"
              name="delete-memory"
              checked={!deleteMemories}
              onChange={() => setDeleteMemories(false)}
            />
            <span>
              <span className="block text-[14px] text-[var(--rk-ink)]">
                <Trans>Keep memories</Trans>
              </span>
              <span className="mt-0.5 block text-[12.5px] text-[var(--rk-muted)]">
                <Trans>Move them to your shared memory.</Trans>
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-[11px] border border-[var(--rk-hairline-strong)] p-3">
            <input
              type="radio"
              name="delete-memory"
              checked={deleteMemories}
              onChange={() => setDeleteMemories(true)}
            />
            <span>
              <span className="block text-[14px] text-[var(--rk-ink)]">
                <Trans>Delete memories too</Trans>
              </span>
              <span className="mt-0.5 block text-[12.5px] text-[var(--rk-muted)]">
                <Trans>This cannot be undone.</Trans>
              </span>
            </span>
          </label>
        </fieldset>
        {error ? <p className="mt-3 text-[13.5px] text-[#FF5364]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="rounded-[10px] px-3.5 py-2 text-[14px] text-[var(--rk-body)] hover:bg-[#29292D] disabled:opacity-40"
          >
            <Trans>Cancel</Trans>
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              setError(null);
              void onConfirm(deleteMemories).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : t`Could not delete bot`);
                setDeleting(false);
              });
            }}
            className="rounded-[10px] bg-[#FF5364] px-3.5 py-2 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {deleting ? <Trans>Deleting…</Trans> : <Trans>Delete</Trans>}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteRoutineDialog({
  routine,
  onCancel,
  onConfirm,
}: {
  routine: Routine;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useLingui();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleting, onCancel]);

  return (
    <div
      role="presentation"
      className="absolute inset-0 z-50 grid place-items-center bg-[rgba(4,4,5,.76)] px-5"
      onPointerDown={() => {
        if (!deleting) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-routine-title"
        aria-describedby="delete-routine-description"
        className="w-full max-w-[420px] rounded-[18px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-surface-2)] p-5 shadow-[0_24px_70px_rgba(0,0,0,.65)]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2 id="delete-routine-title" className="text-[17px] font-medium text-[var(--rk-ink)]">
          <Trans>Delete {routine.name}?</Trans>
        </h2>
        <p
          id="delete-routine-description"
          className="mt-2 text-[14px] leading-6 text-[var(--rk-muted)]"
        >
          <Trans>This cannot be undone.</Trans>
        </p>
        {error ? <p className="mt-3 text-[13.5px] text-[#FF5364]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="rounded-[10px] px-3.5 py-2 text-[14px] text-[var(--rk-body)] hover:bg-[#29292D] disabled:opacity-40"
          >
            <Trans>Cancel</Trans>
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              setDeleting(true);
              setError(null);
              void onConfirm().catch((err: unknown) => {
                setError(err instanceof Error ? err.message : t`Could not delete routine`);
                setDeleting(false);
              });
            }}
            className="rounded-[10px] bg-[#FF5364] px-3.5 py-2 text-[14px] font-medium text-white disabled:opacity-40"
          >
            {deleting ? <Trans>Deleting…</Trans> : <Trans>Delete</Trans>}
          </button>
        </div>
      </div>
    </div>
  );
}

function embeddableScreenUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.href);
    const page = new URL(window.location.href);
    const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    const pagePort = page.port || (page.protocol === "https:" ? "443" : "80");
    if (local && parsed.port && parsed.port !== pagePort) {
      return null;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function screenIframeSandbox(url: string | null) {
  if (!url) return undefined;
  try {
    return new URL(url, window.location.href).pathname.startsWith("/novnc/")
      ? "allow-scripts allow-pointer-lock"
      : undefined;
  } catch {
    return undefined;
  }
}

function computerPlaceholder(
  state: ComputerStatus["state"] | undefined,
  booting: boolean,
  label: string,
) {
  if (state === "booting" || booting) return t`Booting live desktop…`;
  if (state === "running") return label;
  if (state === "suspended") return t`Computer is asleep — take control to wake it`;
  if (state === "error") return t`Computer failed to boot`;
  return t`Computer is stopped`;
}

function computerLabel(mode: ComputerStatus["mode"] | undefined, botName: string) {
  return mode === "dedicated" ? t`${botName}’s computer` : t`Team Computer`;
}

function ChoiceCard({
  botId,
  block,
  onBotChanged,
}: {
  botId: string;
  block: Extract<MessageBlock, { kind: "choice" }>;
  onBotChanged: () => Promise<void>;
}) {
  const { t } = useLingui();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(optionId: string) {
    setPending(true);
    setError(null);
    try {
      await rpc.onboarding.choose({ botId, optionId });
      await onBotChanged().catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not save this choice`);
      setPending(false);
    }
  }

  return (
    <div className="flex justify-start">
      <div className="w-[min(420px,80%)] rounded-[20px] bg-[var(--rk-surface-2)] px-[18px] py-[14px]">
        <div className="text-[15.5px] text-[var(--rk-body)]">{block.question}</div>
        {block.subtitle ? (
          <div className="mt-0.5 text-[13px] text-[var(--rk-muted)]">{block.subtitle}</div>
        ) : null}
        <div className="mt-3 space-y-1.5">
          {block.options
            .filter((option) => !block.answerId || option.id === block.answerId)
            .map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={Boolean(block.answerId) || pending}
                onClick={() => void choose(option.id)}
                className={`flex w-full items-center gap-3 rounded-[12px] border border-[var(--rk-hairline-strong)] px-3.5 py-3 text-start disabled:opacity-60 ${block.answerId ? "bg-[#1F1F23]" : "bg-[#161619] hover:bg-[#222226]"}`}
              >
                <span className="grid h-[24px] w-[24px] place-items-center rounded-[7px] bg-[var(--rk-hover)] text-[12.5px] text-[var(--rk-muted)]">
                  {option.letter}
                </span>
                <span
                  className={`flex-1 text-[15px] ${block.answerId ? "text-[var(--rk-muted)]" : "text-[var(--rk-ink)]"}`}
                >
                  {option.label}
                </span>
                {block.answerId === option.id ? <span className="text-[#B9B9C0]">✓</span> : null}
              </button>
            ))}
        </div>
        {error ? <p className="mt-2 text-xs text-[#F07178]">{error}</p> : null}
      </div>
    </div>
  );
}

function AppConnectCard({
  botId,
  block,
}: {
  botId: string;
  block: Extract<MessageBlock, { kind: "app_connect" }>;
}) {
  const { t } = useLingui();
  const [busy, setBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState<"pending" | "connected">(block.status);
  const [error, setError] = useState<string | null>(null);
  const connectionAttempt = useRef<AbortController | null>(null);
  const status = block.status === "connected" ? "connected" : localStatus;
  useEffect(() => () => connectionAttempt.current?.abort(), []);

  async function authorize() {
    connectionAttempt.current?.abort();
    const controller = new AbortController();
    connectionAttempt.current = controller;
    setBusy(true);
    setError(null);
    try {
      const started = await rpc.connections.begin({
        provider: block.provider,
        displayName: block.name,
      });
      if (started.authorizationUrl) {
        window.open(started.authorizationUrl, "rakazo-app-connect", "popup,width=560,height=720");
      }
      for (let i = 0; i < 60; i += 1) {
        if (controller.signal.aborted) return;
        const row = await rpc.connections
          .complete({ connectionId: started.connectionId })
          .catch(() => undefined);
        if (row?.status === "connected") {
          if (controller.signal.aborted) return;
          setLocalStatus("connected");
          await rpc.onboarding
            .appConnected({ botId, provider: block.provider })
            .catch(() => undefined);
          return;
        }
        await abortableDelay(2_000, controller.signal);
      }
      if (!controller.signal.aborted) setError(t`Authorization timed out. Please try again.`);
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : t`Could not authorize this app`);
      }
    } finally {
      if (connectionAttempt.current === controller) {
        connectionAttempt.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <BuiCard
      role="group"
      aria-label={t`${block.name} connection`}
      className="w-[min(420px,80%)] px-4 py-3.5"
    >
      <div className="flex items-center gap-3.5">
        {block.logo ? (
          <img
            src={block.logo}
            alt=""
            className="h-10 w-10 rounded-[10px] bg-white object-contain p-1"
          />
        ) : (
          <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[#30356A] text-[15px] text-[#E2E4FF]">
            {block.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium" style={{ color: "var(--bui-ink)" }}>
            {block.name}
          </span>
          <span className="block truncate text-[13px]" style={{ color: "var(--bui-ink-3)" }}>
            {block.description}
          </span>
        </span>
        {status === "connected" ? (
          <SuccessPop label={t`Connected`} />
        ) : (
          <BuiButton disabled={busy} onClick={() => void authorize()}>
            {busy ? t`Waiting…` : t`Authorize`}
          </BuiButton>
        )}
      </div>
      {error ? <p className="mt-2 text-xs text-[#F07178]">{error}</p> : null}
    </BuiCard>
  );
}

function ChartCanvas({
  spec,
  data,
  width,
  height,
}: {
  spec: Record<string, unknown>;
  data: unknown[];
  width: number;
  height?: number;
}) {
  const { t } = useLingui();
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    title?: string;
    swatches: { label: string; color: string }[];
  }>({ swatches: [] });
  useEffect(() => {
    let cancelled = false;
    // Plot loads lazily so threads without charts never pay for the library.
    void (async () => {
      try {
        const { buildPlotParts } = await import("@rakazo/core/plot");
        if (cancelled || !ref.current) return;
        // Hover inspection by default: give the first mark a tooltip unless
        // the spec already asks for one somewhere.
        const marks = Array.isArray((spec as { marks?: unknown[] }).marks)
          ? ((spec as { marks: { options?: Record<string, unknown> }[] }).marks ?? [])
          : [];
        const hasTip = marks.some((mark) => mark.options && "tip" in mark.options);
        const liveSpec = hasTip
          ? spec
          : {
              ...spec,
              marks: marks.map((mark, index) =>
                index === 0 ? { ...mark, options: { ...(mark.options ?? {}), tip: true } } : mark,
              ),
            };
        const parts = buildPlotParts(liveSpec as never, data, document, { width, height });
        setMeta({ title: parts.title, swatches: parts.swatches });
        setError(null);
        ref.current.replaceChildren(parts.plotted);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t`Could not render chart`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spec, data, width, height, t]);
  if (error)
    return (
      <div className="text-[13px] text-[#F3A2AA]">
        <Trans>Chart failed to render: {error}</Trans>
      </div>
    );
  return (
    <div className="text-[var(--rk-body)]">
      {meta.title ? (
        <div className="mb-1 text-[14.5px] font-semibold text-[var(--rk-ink)]">{meta.title}</div>
      ) : null}
      {meta.swatches.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
          {meta.swatches.map((swatch) => (
            <span
              key={swatch.label}
              className="flex items-center gap-1.5 text-[12px] text-[#A6A6AD]"
            >
              <span
                className="h-[10px] w-[10px] rounded-[3px]"
                style={{ background: swatch.color }}
              />
              {swatch.label}
            </span>
          ))}
        </div>
      ) : null}
      <div ref={ref} className="[&_svg]:max-w-full" />
    </div>
  );
}

type McpApprovalState = "pending" | "connecting" | "connected" | "dismissed";

/** Approval card for an agent-created MCP server: the user completes browser
 * OAuth (or confirms no authorization is needed) without leaving the chat. */
function McpApprovalCard({
  botId,
  name,
  serverId,
  transport,
  endpoint,
  needsOAuth,
}: {
  botId: string | undefined;
  name: string;
  serverId: string;
  transport: string;
  endpoint: string | null;
  needsOAuth: boolean;
}) {
  const { t } = useLingui();
  const [state, setState] = useState<McpApprovalState>("pending");
  const [error, setError] = useState<string | null>(null);

  async function authorize() {
    if (!botId) {
      setError(t`This server cannot be assigned without a bot.`);
      return;
    }
    setState("connecting");
    setError(null);
    try {
      if (needsOAuth) {
        const result = await connectMcpOauth(serverId);
        if (result === "cancelled") {
          setState("pending");
          return;
        }
      }
      await rpc.mcp.assignments.approve({ botId, serverId });
      setState("connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Could not approve this server`);
      setState("pending");
    }
  }

  const summary = endpoint ?? `stdio · ${transport}`;
  return (
    <BuiCard className="max-w-[74%] p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#30356A] text-xs text-[#E2E4FF]">
          M
        </span>
        <span className="text-[14.5px] font-medium" style={{ color: "var(--bui-ink)" }}>
          <Trans>Connect MCP server “{name}”</Trans>
        </span>
      </div>
      <p className="mt-1.5 truncate text-[12px]" style={{ color: "var(--bui-ink-3)" }}>
        {summary}
      </p>
      {state === "pending" || state === "connecting" ? (
        <>
          <p className="mt-2 text-[13px] leading-[1.5]" style={{ color: "var(--bui-ink-2)" }}>
            {needsOAuth
              ? t`This server uses browser sign-in. Authorize it to let your agents use its tools — a popup will open.`
              : t`Approve this server to let your agent use its tools.`}
          </p>
          {error ? <p className="mt-2 text-xs text-[#F07178]">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <BuiButton
              tone="accent"
              disabled={state === "connecting"}
              onClick={() => void authorize()}
            >
              {state === "connecting" ? t`Connecting…` : needsOAuth ? t`Authorize` : t`Approve`}
            </BuiButton>
            <BuiButton onClick={() => setState("dismissed")}>
              <Trans>Not now</Trans>
            </BuiButton>
          </div>
        </>
      ) : null}
      {state === "connected" ? (
        <div className="mt-3">
          <SuccessPop label={t`Connected — its tools are available from your next message.`} />
        </div>
      ) : null}
      {state === "dismissed" ? (
        <p className="mt-2 text-[13px] text-[var(--rk-muted)]">
          <Trans>Dismissed — reconnect anytime from MCP settings.</Trans>
        </p>
      ) : null}
    </BuiCard>
  );
}

function ChartBlockView({
  name,
  spec,
  data,
}: {
  name: string;
  spec: Record<string, unknown>;
  data: unknown[];
}) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    if (!expanded) return;
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [expanded]);
  const expandedViewport = chartViewport(viewport.width, viewport.height);
  return (
    <>
      <div className="group relative max-w-[74%] rounded-[20px] bg-[var(--rk-solid-ink)] p-4">
        <ChartCanvas spec={spec} data={data} width={520} />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="absolute end-3 top-3 rounded-lg border border-[#34343B] bg-[var(--rk-hover)] px-2.5 py-1 text-[11px] text-[#B9B9C0] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A6A6AD]"
        >
          <Trans>Expand</Trans>
        </button>
      </div>
      {expanded ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,4,5,.78)] p-8"
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={(event) => {
            if (event.target === event.currentTarget) setExpanded(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setExpanded(false);
          }}
        >
          <div className="max-h-[92vh] w-[min(1320px,94vw)] overflow-auto rounded-[24px] border border-[#2A2A31] bg-[var(--rk-surface)] p-8 shadow-[0_40px_90px_rgba(0,0,0,.6)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] text-[var(--rk-muted)]">{name}</span>
              <button
                type="button"
                aria-label={t`Close chart`}
                onClick={() => setExpanded(false)}
                className="text-lg text-[var(--rk-muted)] hover:text-[var(--rk-body)]"
              >
                ✕
              </button>
            </div>
            <ChartCanvas
              spec={spec}
              data={data}
              width={expandedViewport.width}
              height={expandedViewport.height}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function ArtifactImage({
  target,
  artifactId,
  name,
}: {
  target: ArtifactTarget;
  artifactId: string;
  name: string;
}) {
  const { t } = useLingui();
  const [src, setSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const targetBotId = "botId" in target ? target.botId : undefined;
  const targetGroupId = "groupId" in target ? target.groupId : undefined;

  useEffect(() => {
    const element = container.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    void rpc.artifacts
      .get(
        targetBotId
          ? { botId: targetBotId, artifactId }
          : { groupId: targetGroupId ?? "", artifactId },
      )
      .then((artifact) => {
        const bytes = decodeArtifactBase64(artifact.contentBase64);
        objectUrl = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: artifact.mimeType }),
        );
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [artifactId, targetBotId, targetGroupId, visible]);

  return (
    <div ref={container}>
      {src ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="max-w-[240px] overflow-hidden rounded-[20px]"
        >
          <img src={src} alt={name} className="max-h-48 w-full object-cover" />
        </button>
      ) : (
        <div className="rounded-[20px] border border-[var(--rk-hairline-strong)] bg-[var(--rk-solid-ink)] px-4 py-3 text-[14px] text-[var(--rk-muted)]">
          {name}
        </div>
      )}
      {open && src ? (
        <button
          type="button"
          aria-label={t`Close image preview`}
          className="fixed inset-0 z-50 grid place-items-center bg-[rgba(4,4,5,.82)] p-6"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={name}
            className="max-h-[85vh] max-w-[90vw] rounded-[12px] object-contain"
          />
        </button>
      ) : null}
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const base64 = result.includes(",") ? (result.split(",")[1] ?? "") : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
