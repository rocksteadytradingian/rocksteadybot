# RocksteadyBot

[![GitHub stars](https://img.shields.io/github/stars/rocksteadytradingian/RCKBOT?labelColor=black&style=for-the-badge&color=2563EB)](https://github.com/rocksteadytradingian/RCKBOT/stargazers)

![RocksteadyBot — AI teammates you actually own](./docs/readme-hero.png)

RocksteadyBot is an open-source platform for running persistent AI teammates. It runs on the web,
as an Electron desktop app (Windows and macOS), and through an Expo mobile app. Bring your own
model and computer provider, or run the complete stack locally.

RocksteadyBot is in beta.

## Features

### Teammates

- Persistent bots, each with its own conversations, memory, routines, and history
- **Identity files** — edit `USER.md` (who you are), `SOUL.md` (how a bot speaks), and `IDENTITY.md`
  (who a bot is); they feed an always-on memory layer ahead of everything else
- Durable Markdown memory plus semantic recall, with a compacted running summary of older turns so
  long threads stay in budget
- Bots delegate to peer bots — each with its own thread and computer — or to short-lived in-thread
  subagents
- Generated bot avatars with a per-bot style (robot or organic)

### Models

- Bring-your-own model credentials through Pi: OpenRouter, OpenAI-compatible endpoints, Anthropic,
  xAI / SuperGrok, GitHub Copilot, ChatGPT Plus / Pro, and more
- **Auto routing** — set fast / smart / heavy model slots per provider and let each turn pick the
  right one by task complexity
- TokenRouter provider support (one API key against a fixed endpoint)
- Per-bot model overrides

### Computers

- Shared Team Computers and isolated Private computers
- Browser, terminal, file, and full graphical desktop access
- Host clipboard paste straight into the remote desktop (Ctrl/Cmd+V, Shift+Insert)
- Docker, E2B, Daytona, Box, and trusted local-computer backends

### Voice

- Speak replies, hold-to-talk dictation, and half-duplex calls
- Bring your own ElevenLabs, OpenAI, or Cartesia key; speech sits behind a provider-neutral
  interface and keys stay on the server

### Integrations

- Composio or Pipedream Connect app catalogs, plus user-installed Treg, remote MCP, and OpenAPI
  tool sources
- Per-connector usage quotas
- Connect Gmail and other Google apps as plugins instead of a live account sign-in

### Safety and control

- Approvals inbox with per-action approval rules
- Masked secret handoff (`request_secret`): collect a one-shot OTP, password, or API key in a field
  that never reaches the chat transcript or the model
- `request_takeover` hands you the live desktop for logins, CAPTCHA, and human judgement
- Tool output is compacted before it reaches the model, keeping errors and stack traces intact
- Worker health and stall monitoring, with in-app stack-repair approvals

### Workspaces and UI

- Multiple workspaces with fast switching and cross-workspace search
- Light and dark themes with a theme picker and contrast-checked tokens
- Transcript follows new messages without interrupting a reader, with a jump-to-latest control
- Web (and Electron-hosted) UI in English, Deutsch, and 한국어

### Desktop and mobile

- One-click **RocksteadyBot** shortcut on Windows: installs Electron on first launch, starts the
  local Docker stack, and opens a single-instance window
- Optional local sign-in with password reset (Supabase optional); the first run can create the
  account
- Mobile: point the app at any self-hosted API origin, a native inbox, and live desktop takeover

## Stack

- TypeScript
- React 19, Vite, and Tailwind CSS
- Electron and Expo
- Hono and oRPC
- PostgreSQL and Prisma
- Better Auth
- Graphile Worker
- Pi
- Docker, E2B, Daytona, and Box
- Composio, Pipedream Connect, MCP, and OpenAPI integrations

## Quick start

You need Node.js 22+, pnpm 9, and Docker Desktop.

```bash
git clone https://github.com/rocksteadytradingian/RCKBOT.git
cd RCKBOT
cp .env.example .env
```

Set `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` in `.env` to independent, long random values. You can
also set `OPENROUTER_API_KEY`, or connect a supported model provider during onboarding.

Managed app catalogs are optional. Set `COMPOSIO_API_KEY` for Composio, or the
`PIPEDREAM_CLIENT_ID`, `PIPEDREAM_CLIENT_SECRET`, and `PIPEDREAM_PROJECT_ID` trio for Pipedream
Connect. Users can add an HTTPS MCP server, Treg endpoint, or OpenAPI JSON document from
**Integrations** without enabling either managed catalog. Connector credentials are encrypted on the
server and are never returned by the API.

Treg is usage-metered. Self-hosters supply their own Treg token; operators embedding Treg in a
hosted product should review [Treg's integration terms](https://treg.to/integrate.md), which require
a written agreement for hosted resale.

```bash
docker compose --env-file .env -f infra/compose/docker-compose.yml up postgres -d
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm sandbox:build
pnpm dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173), create an account, connect a model, and create
your first bot.

For an agent-assisted installation, use [SETUP_PROMPT.md](./SETUP_PROMPT.md). For deployment,
provider selection, backups, and upgrades, see the [self-hosting guide](./docs/self-host.md).

## Desktop and mobile

The Electron and Expo apps are clients of the same RocksteadyBot API used by the web app.

On Windows, double-click the **RocksteadyBot** desktop shortcut (or
`apps/desktop/scripts/open-desktop.cmd`). That starts Docker Compose for the local stack and opens
the desktop app — no separate `pnpm` or Compose command. The first launch also installs Electron if
it is missing and writes the shortcut onto the desktop. Later launches start the stack if it is
down, and stop leftover RocksteadyBot processes on ports 3100 and 5173 without touching Docker or
unrelated apps.

To pack or run Electron from a terminal while the stack is already up:

```bash
pnpm --filter @rakazo/desktop dev
```

> The monorepo's workspace packages are published under the `@rakazo/*` scope and runtime
> environment variables use the `RAKAZO_` prefix. These are internal identifiers, unchanged from the
> upstream project; renaming them is a separate task from this README.

On first run the desktop app asks whether to use the RocksteadyBot stack on this computer
(`http://127.0.0.1:5173`) or connect to an existing server. Public servers must use HTTPS; HTTP is
accepted only for loopback and private LAN addresses (not link-local). The app verifies the
RocksteadyBot health endpoint before saving, and later launches go straight to that instance.

Use **Change RocksteadyBot Server…** in the application menu to reconnect. Closing that window
without saving returns to the previous instance. For development automation, set `RAKAZO_WEB_URL` to
point the shell somewhere else without changing the saved instance, or `RAKAZO_FORCE_SETUP=1` to run
setup again.

Mobile build and release instructions live in [docs/mobile-release.md](./docs/mobile-release.md).

## Web UI language

The web (and Electron-hosted) UI supports English, Deutsch, and 한국어. Change it under
**Settings → Language**. The marketing homepage (`apps/www`) is available in en/de/ko via
footer language links (`/`, `/de/`, `/ko/`); other marketing pages stay English.

## Development

RocksteadyBot is a TypeScript monorepo built with React, Electron, Expo, Hono, Postgres, Prisma,
Graphile Worker, and Pi.

```text
apps/       web, api, worker, desktop, mobile, and public website
packages/   domain, contracts, persistence, adapters, UI, and test tooling
infra/      local services and computer images
docs/       architecture, operations, and release guides
```

Common checks:

```bash
pnpm lint
pnpm check
pnpm test
pnpm test:integration
pnpm test:e2e
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the development workflow and test matrix.

## Documentation

```bash
pnpm test              # unit, property, and in-process contract tests
pnpm test:integration  # Postgres journeys, Graphile jobs, LISTEN/NOTIFY
pnpm test:e2e          # Playwright against the emulated stack
pnpm test:e2e -- --sandbox=e2b # the same deterministic suite against real E2B
pnpm test:e2e -- --sandbox=daytona # the same suite against real Daytona
pnpm test:e2e -- --sandbox=box # the same suite against real Box
pnpm test:topology     # local Docker + Graphile worker recovery (needs Docker)
pnpm test:canary       # live OpenRouter / E2B / Box canaries
# explicit real vision-model + real E2B desktop acceptance test:
COMPUTER_E2E_MODEL=<vision-capable-openrouter-model-id> pnpm test:computer
```

- [Self-hosting](./docs/self-host.md)
- [Computer runtime and isolation](./docs/computer-runtime.md)
- [Mobile releases](./docs/mobile-release.md)
- [Performance testing](./docs/performance.md)

## Contributing

The Playwright workflow can also be started manually with **Sandbox provider** set to `e2b`,
`daytona`, or `box`. Those options require `E2B_API_KEY`, `DAYTONA_API_KEY`, or `BOX_API_KEY`, keep
the deterministic scripted agent runtime, and destroy the provider machines after the run. The
default and all automatic runs remain on `fake`.

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull
request. For security vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of filing a
public issue.

## License

RocksteadyBot is licensed under the [Apache License 2.0](./LICENSE). It is a fork of the
Apache-2.0-licensed [Rakazo](https://github.com/elie222/rakazo) project.
