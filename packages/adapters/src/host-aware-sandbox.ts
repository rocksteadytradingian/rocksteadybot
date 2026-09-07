import type {
  AdapterContext,
  CommandRequest,
  ComputerActionRequest,
  ComputerInput,
  ComputerRef,
  ControlLeaseRef,
  PortableFile,
  ProcessEvent,
  SandboxProvider,
  ScreenRequest,
} from "@rakazo/adapter-kit";
import { botFolderMountsEnabled } from "@rakazo/core";
import { listBotFolders, type PrismaClient } from "@rakazo/db";
import { DesktopSandboxProvider } from "./desktop-sandbox.js";
import { createSandboxProvider, type SandboxProviderOptions } from "./sandbox-factory.js";

export function sandboxKindForBot(envKind: string, computerHost: string | null | undefined) {
  if (envKind === "docker" && computerHost === "this-mac") return "desktop";
  return envKind;
}

/**
 * A bot reaches the host filesystem only through the folders it has explicitly
 * allow-listed (see BotFolder) — another bot on the same computer does not
 * inherit them. With no `prisma` to resolve that list, no host folder is offered.
 */
function botRootResolver(prisma: PrismaClient | undefined) {
  if (!prisma) return undefined;
  return async (botId: string) => {
    const folders = await listBotFolders(prisma, botId);
    return folders.map((folder) => folder.path);
  };
}

export function createRunSandbox(
  kind: string,
  opts: SandboxProviderOptions & { prisma?: PrismaClient },
): SandboxProvider {
  const resolveBotRoots = botRootResolver(opts.prisma);
  if (kind === "desktop") {
    return new DesktopSandboxProvider({
      root: opts.dataDir,
      hostRoots: [],
      resolveBotRoots,
    });
  }
  const primary = createSandboxProvider(kind, opts);
  if (kind !== "docker" || !opts.prisma) return primary;
  return new HostAwareSandbox(
    primary,
    new DesktopSandboxProvider({
      root: opts.dataDir,
      hostRoots: [],
      resolveBotRoots,
    }),
    async () => {
      const settings = await opts.prisma!.deploymentSettings.findUnique({
        where: { id: "default" },
      });
      return settings?.computerHost === "this-mac";
    },
    // Bind-mount a bot's folders into its Docker computer only when the
    // deployment opts in. `botId` is the bot's own id for a Private computer and
    // `team-<workspaceId>` for a shared one, which has no folder rows — so shared
    // computers get nothing without any extra check.
    botFolderMountsEnabled() ? resolveBotRoots : undefined,
  );
}

export class HostAwareSandbox implements SandboxProvider {
  constructor(
    private readonly isolated: SandboxProvider,
    private readonly host: SandboxProvider,
    private readonly hostEnabled: () => Promise<boolean>,
    private readonly resolveBotFolders?: (botId: string) => Promise<string[]>,
  ) {}

  describe() {
    return this.isolated.describe();
  }

  private route(computer: ComputerRef) {
    return computer.kind === "desktop" ? this.host : this.isolated;
  }

  async provision(
    request: {
      botId: string;
      homePath: string;
      providerRef?: string;
      providerKind?: ComputerRef["kind"];
      folders?: string[];
    },
    context: AdapterContext,
  ) {
    const provider = (await this.hostEnabled()) ? this.host : this.isolated;
    const providerKind = provider.describe().id;
    // Only the isolated (Docker) provider bind-mounts folders at provision time;
    // the desktop provider reads the same list itself, per command.
    const folders =
      provider === this.isolated && this.resolveBotFolders
        ? await this.resolveBotFolders(request.botId).catch(() => [])
        : undefined;
    return provider.provision(
      {
        ...request,
        folders: folders && folders.length > 0 ? folders : undefined,
        providerRef: request.providerKind === providerKind ? request.providerRef : undefined,
      },
      context,
    );
  }

  prepare(computer: ComputerRef, context: AdapterContext) {
    return this.route(computer).prepare(computer, context);
  }

  async *execute(
    computer: ComputerRef,
    request: CommandRequest,
    context: AdapterContext,
  ): AsyncIterable<ProcessEvent> {
    yield* this.route(computer).execute(computer, request, context);
  }

  connectScreen(computer: ComputerRef, request: ScreenRequest, context: AdapterContext) {
    return this.route(computer).connectScreen(computer, request, context);
  }

  sendInput(
    computer: ComputerRef,
    input: ComputerInput,
    lease: ControlLeaseRef,
    context: AdapterContext,
  ) {
    return this.route(computer).sendInput(computer, input, lease, context);
  }

  observe(computer: ComputerRef, context: AdapterContext) {
    return this.route(computer).observe(computer, context);
  }

  act(computer: ComputerRef, request: ComputerActionRequest, context: AdapterContext) {
    return this.route(computer).act(computer, request, context);
  }

  listFiles(computer: ComputerRef, path: string, context: AdapterContext) {
    return this.route(computer).listFiles(computer, path, context);
  }

  readFile(
    computer: ComputerRef,
    path: string,
    context: AdapterContext,
    options?: { maxBytes?: number },
  ) {
    return this.route(computer).readFile(computer, path, context, options);
  }

  writeFile(computer: ComputerRef, file: PortableFile, context: AdapterContext) {
    return this.route(computer).writeFile(computer, file, context);
  }

  exportWorkspace(computer: ComputerRef, context: AdapterContext) {
    return this.route(computer).exportWorkspace(computer, context);
  }

  importWorkspace(
    computer: ComputerRef,
    files: AsyncIterable<PortableFile>,
    context: AdapterContext,
  ) {
    return this.route(computer).importWorkspace(computer, files, context);
  }

  snapshot(computer: ComputerRef, context: AdapterContext) {
    return this.route(computer).snapshot(computer, context);
  }

  keepAlive(computer: ComputerRef) {
    return this.route(computer).keepAlive?.(computer) ?? Promise.resolve();
  }

  releaseScreen(computer: ComputerRef, context: AdapterContext) {
    return this.route(computer).releaseScreen?.(computer, context) ?? Promise.resolve();
  }

  setScreenControl(
    computer: ComputerRef,
    interactive: boolean,
    context: AdapterContext,
    controlToken?: string,
  ) {
    return (
      this.route(computer).setScreenControl?.(computer, interactive, context, controlToken) ??
      Promise.resolve()
    );
  }

  stop(computer: ComputerRef, context: AdapterContext) {
    return this.route(computer).stop(computer, context);
  }

  destroy(computer: ComputerRef, context: AdapterContext) {
    return this.route(computer).destroy(computer, context);
  }
}
