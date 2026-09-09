# Features

A description and usage guide for every feature listed in the
[README](../README.md#features). Each entry says what the feature is and how to
use it.

Terms used below:

- **Left sidebar** — the bot and group list. The **+** at the top adds a bot or a
  group; the account button at the bottom opens the **main menu**.
- **Main menu** — Settings, Models, Memory, Voice, Screen privacy, Skill
  revisions, Sentinels, Usage, Themes, Restart computer, Restart API, Log out.
- **Plugins** — its own button just above the account button in the left sidebar.
- **Right panel** — opens from the bot header; holds **Settings**, **Routines**,
  **Folders**, and the **Scratchpad** for the selected bot.
- **Composer** — the message box. It carries the attach, dictate, and skill
  controls.

---

## Teammates

### Persistent bots

**What it is.** Each bot is a standing teammate with its own conversation,
memory, routines, computer, and history. Bots do not reset between sessions.

**How to use it.**
1. Click **+** at the top of the left sidebar → **New bot**.
2. Give it a **Name**, **Title**, and **Description**. The description tells the
   bot what it is for.
3. Open the bot and type in the composer to start the first thread.
4. Switch bots from the left sidebar; each keeps its own scrollback.
5. Right panel → **Settings** → **Clear conversation** wipes the thread;
   **Export** downloads it. Deleting a bot (bot context menu) asks whether to
   keep or remove its memories.

### Identity files — `USER.md`, `SOUL.md`, `IDENTITY.md`

**What it is.** Three Markdown files that load ahead of everything else on every
turn: `USER.md` (who you are), `SOUL.md` (how the bot speaks), `IDENTITY.md`
(who the bot is).

**How to use it.**
1. Right panel → **Settings** for the bot.
2. Edit **How it speaks** (`SOUL.md`) and **How it acts** (`IDENTITY.md`)
   directly in the settings form.
3. `USER.md` is shared across your bots — set it once with facts about you,
   your preferences, and how you want to be addressed.
4. Keep them short. They are prepended to context every turn, so wording costs
   budget on each message.

### Memory — Markdown store plus semantic recall

**What it is.** A durable Markdown memory the bot writes to, plus semantic recall
that pulls back relevant past notes. Older turns are compacted into a running
summary so long threads stay within the context budget.

**How to use it.**
1. The bot writes memories on its own as facts come up; you can also tell it
   “remember that …”.
2. Set the reach per bot: right panel → **Settings** → **Advanced** → **Memory
   scope** (**Isolated** = this bot only, **Shared** = the workspace memory).
3. Main menu → **Memory** sets the workspace default scope and connects an
   optional semantic memory provider (e.g. Supermemory). Without a provider,
   recall falls back to the Markdown store.
4. On delete, choose **Keep memories** (move to shared memory) or **Delete
   memories too**.

### Peer bots and subagents

**What it is.** A bot can hand work to another bot — each peer runs in its own
thread on its own computer — or spin up a short-lived subagent inside the current
thread for a scoped subtask.

**How to use it.**
1. Create the bots you want available as peers; the delegating bot picks a peer
   by name when a task fits it.
2. Watch peer traffic in the **Peer messages** view (opens from the bot header
   when peer activity exists).
3. Subagents appear inline in the transcript tagged `subagent` while they run and
   collapse when done. No setup — the bot opens one when a subtask is isolated
   enough to warrant it.

### Generated avatars

**What it is.** Each bot gets a generated avatar in a per-bot visual style.

**How to use it.**
1. Set the style when creating or editing the bot (**robot** or **organic**).
2. The avatar regenerates from the bot’s name and style; save the bot to
   refresh it.

### Charts

**What it is.** Bots render bar, line, area, scatter, histogram, heatmap, and box
plots and attach the result to the thread as a PNG.

**How to use it.**
1. Ask the bot to chart data — paste rows inline, or point it at a `.csv`,
   `.tsv`, or `.json` file in its home directory.
2. Name the chart type if you want a specific one; otherwise the bot picks.
3. The PNG lands in the transcript. Click it to expand; use **Close chart** to
   dismiss the overlay.

---

## Automation

### Routines

**What it is.** A saved prompt that runs on a schedule — cron, a fixed interval,
or a one-shot time — with timezone support.

**How to use it.**
1. Right panel → **Routines** → **New routine**.
2. Fill in **Name**, **Instruction** (the prompt to run), and **When to run**.
3. **When to run** presets: **Every hour**, **Every day**, **Weekdays**, **Every
   week**, **Every month**, **Interval** (amount + minutes/hours/days), or
   **Cron** (raw expression). Set **Time of day** where the preset uses one.
4. **+ Add another schedule** attaches more than one trigger to the same routine.
5. Reference a skill from the instruction with `@Name`.
6. A running routine shows **Running · Stop** in the list. **Delete routine**
   removes it.

### Sentinels

**What it is.** A watch on a URL or an on-screen condition. When it trips, the
bot either posts you a message or starts a run. It can fire when the condition
first passes, when the status changes, or once it has held for a set window.

**How to use it.**
1. In the composer, ask the bot to watch something — e.g. “watch this page and
   tell me when the price drops below X”, or “start a run when the build badge
   goes green”.
2. The bot creates the sentinel and chooses **post a message** or **start a
   run** based on what you asked.
3. Main menu → **Sentinels** lists active watches with their state; use
   **Cancel** to stop one. Paused sentinels are marked `paused`.

### Skills

**What it is.** A reusable recipe of tool steps. Built-in, plugin, and your own
skills sit side by side. When a run that followed a skill fails its check, a
revised version is drafted for you to review.

**How to use it.**
1. Ask a bot to “save that as a skill” after a useful sequence of steps, or
   author one directly.
2. Run a skill from the composer by typing `/Name` — a skill chip attaches to
   the message. Remove it with the chip’s **×**.
3. From a routine instruction, call a skill with `@Name`.
4. Main menu → **Skill revisions** shows any skill with a **Proposed** version
   next to its **Current** one. **Accept** adopts it; **Dismiss** keeps the
   current version.

### Scratchpad

**What it is.** A per-bot list of parked, open work that outlives a single turn —
separate from scheduled routines.

**How to use it.**
1. Right panel → **Open work**.
2. Type an item and **Add** to park it; **Park** sends in-thread work to the
   list; **Open** brings an item back into focus.
3. The bot consults its scratchpad when deciding what to pick up next.

---

## Models

### Bring-your-own model credentials (Pi)

**What it is.** Connect your own model provider accounts — OpenRouter,
OpenAI-compatible endpoints, Anthropic, xAI / SuperGrok, GitHub Copilot,
ChatGPT Plus / Pro, and more — through Pi.

**How to use it.**
1. Onboarding’s **Connect a model** step, or later Main menu → **Models**.
2. Search **Providers**, pick one, and either paste an **API key** or complete
   the provider’s sign-in (**Waiting for sign-in…** resolves when you finish in
   the browser).
3. For an OpenAI-compatible server, set **Server URL**, then **Find models** and
   pick one, or type an exact model id.
4. Keys are encrypted on the server and never returned by the API. Use
   **Replace API key** to rotate.

### Auto routing

**What it is.** Per-provider **Fast**, **Smart**, and **Heavy** model slots; each
turn picks a slot by task complexity (Fast = simple, Smart = planning and
coding, Heavy = hard and vision).

**How to use it.**
1. Main menu → **Models**, select a router-capable provider.
2. Set the **Fast**, **Smart**, and **Heavy** slots to specific model ids.
3. Set the active model to **Auto** to let routing choose per turn.

### TokenRouter

**What it is.** One API key against a fixed TokenRouter endpoint.

**How to use it.** Main menu → **Models** → select TokenRouter, paste the key.
No base URL to manage.

### Per-bot model overrides

**What it is.** A single bot can run on a different model than the workspace
default.

**How to use it.** Right panel → **Settings** → **Advanced** → **Model**. Leave
it on the default to follow the workspace, or pick a connected model for this bot
only. **Thinking** on the same panel controls reasoning effort.

---

## Computers

### Team vs Private computers

**What it is.** **Team Computers** are shared across bots; **Private** computers
belong to one bot.

**How to use it.**
1. Open the bot’s **Computer** panel from the bot header.
2. Toggle **Team** / **Private**. Private means “Only this bot uses this
   computer”; Team means “Shared with other bots”.
3. Some features (see **Folders**) require Private.

### Shared Team Computer in a group

**What it is.** In a group thread each bot keeps its **own** computer for its work, and
*also* gets tools to reach the workspace **Team Computer** — a shared desktop the whole
group can use for coordination. The bot decides when to use it. The group’s **Computer**
panel lets you watch and take control of that same shared machine (boot/stop,
recover/reset). It boots only when first used — by an agent or by you.

**How to use it.** Ask the group to do something that needs shared context (e.g. “put the
plan on the team computer so everyone can see it”). Open the group thread and click the
**monitor** icon in the header to watch or take over. Leaving the group removes the shared
tools; no computer is reassigned.

### Browser, terminal, file, and desktop access

**What it is.** Each computer exposes a browser, a terminal, a file system, and a
full graphical desktop.

**How to use it.**
1. Ask the bot to do the work; it drives the surfaces itself.
2. Open the **Computer** panel to watch. **Open in full window** maximizes it.
3. **Restart computer** (main menu, or **Recover computer** in the bot panel)
   reboots a stuck machine.

### Host clipboard paste

**What it is.** Paste from your machine straight into the remote desktop.

**How to use it.** Focus the remote desktop view and press **Ctrl/Cmd+V** or
**Shift+Insert**. The host clipboard contents are typed into the remote session.

### Backends

**What it is.** Docker, E2B, Daytona, Box, and trusted local-computer backends.

**How to use it.** Selected by deployment configuration (see
[docs/computer-runtime.md](./computer-runtime.md) and
[docs/self-host.md](./self-host.md)). The default local stack uses Docker;
`pnpm sandbox:build` builds the image.

### Folders

**What it is.** A per-bot allow-list of host directories the bot may use as a
working directory. Scoped to one bot — a peer sharing the same computer does not
inherit them. Mounted read-write at `/mnt/folders/<name>` inside the computer.

**How to use it.**
1. Switch the bot to a **Private** computer (folders do not mount on Team).
2. Right panel → **Folders** → **+ Add folder**.
3. Type an **absolute folder path**, or use **Browse…** in the desktop app.
4. After adding or removing a folder, restart the computer so the change takes
   effect — use **Recover computer**, or stop the computer and send the bot a
   message. A running computer keeps its old folders until then.
5. **Remove** revokes access to a folder.

---

## Voice

### Speech, dictation, and calls

**What it is.** Spoken replies, hold-to-talk dictation, and half-duplex voice
calls.

**How to use it.**
1. Reply playback: the **Speak** control on a bot message reads it aloud;
   **Stop** halts playback.
2. Dictation: the **Dictate** button in the composer transcribes speech into the
   message box; press again to **Stop dictation**.
3. Calls: open the call view from the bot header for a half-duplex conversation.
4. Turn on **Read replies aloud** per bot in right panel → **Settings** →
   **Advanced**.

### Bring-your-own speech key

**What it is.** ElevenLabs, OpenAI, or Cartesia behind a provider-neutral
interface; keys stay on the server.

**How to use it.**
1. Main menu → **Voice**.
2. Pick a provider, choose **Speak + transcribe** or **Speak only**, and paste
   the **API key**.
3. **Hear a sample** previews the selected voice.

### Local transcription

**What it is.** On-device dictation with no cloud key, when the server has a
`whisper-cli` / `whisper` binary and a `ggml-*.bin` model.

**How to use it.** Install a Whisper binary and model on the server. The Voice
panel shows “On-device dictation is available — no key or setup needed” when it
is detected, and dictation works without connecting a provider.

---

## Integrations

### Managed app catalogs (Composio / Pipedream Connect)

**What it is.** Hosted catalogs of connectable apps, on separate tabs in
**Plugins**.

**How to use it.**
1. Set the operator keys in `.env` — `COMPOSIO_API_KEY`, or the
   `PIPEDREAM_CLIENT_ID` / `PIPEDREAM_CLIENT_SECRET` / `PIPEDREAM_PROJECT_ID`
   trio.
2. Open **Plugins**, pick the catalog tab, find an app, and **Add** / connect it.
3. **Disconnect** removes a connected app.

### User-installed tool sources

**What it is.** Treg endpoints, remote MCP servers, and OpenAPI documents added
without any managed catalog.

**How to use it.**
1. **Plugins** → **Advanced**.
2. **Add remote MCP server** (streamable HTTP or SSE URL, optional **Bearer
   token** or **API key header**), **Import OpenAPI JSON**, or **Connect Treg**.
3. **Verify and add** checks the source before installing. Installed sources are
   listed under **Tool sources**; **Remove** uninstalls one.
4. Self-hosters supply their own Treg token; hosted resale needs a written
   agreement — see [Treg’s integration terms](https://treg.to/integrate.md).

### Bot-initiated MCP connection

**What it is.** A bot can connect a new MCP server itself from the chat —
streamable HTTP, SSE, or stdio — with an approval card when the server needs
browser authorization.

**How to use it.**
1. Ask the bot to connect a server and give it the URL or command.
2. Approve the **Connect MCP server “…”** card. **Not now** dismisses it — you
   can reconnect later from MCP settings.
3. Main menu path for manual entry: the **MCP servers** overlay — **Add a
   server** with **Command** + **Arguments** (stdio) or **Server URL** +
   **Access token** (remote), plus **Agent access for new servers**.

### Per-connector usage quotas

**What it is.** A cap on how much each connector can be used.

**How to use it.** Set the quota on the connector entry in **Plugins**. Usage
counts toward the cap and the connector stops when it is reached.

### Google apps as plugins

**What it is.** Connect Gmail and other Google apps as plugins rather than a live
account sign-in.

**How to use it.** In **Plugins**, choose the Google plugin for the app you want
and follow its connect flow. The bot then calls it as a tool source.

---

## Safety and control

### Approvals inbox

**What it is.** A queue of actions a bot is waiting to take, with per-action
approval rules.

**How to use it.**
1. Open **Approvals** from the bot header (or **View all**).
2. Review each item — **High risk action** items are flagged — and **Approve**
   or reject. **View** shows detail.
3. Set standing rules so routine actions auto-approve and only sensitive ones
   stop for you.
4. The worker must be running to process approvals; use **Start worker** if
   prompted.

### Masked secret handoff (`request_secret`)

**What it is.** A one-shot field for an OTP, password, or API key that never
reaches the chat transcript or the model.

**How to use it.** When the bot calls `request_secret`, a masked field appears.
Type the value and submit; the bot receives it for that single use only and it
is not stored in the thread.

### `request_takeover`

**What it is.** Hands you the live desktop for logins, CAPTCHAs, and human
judgement.

**How to use it.**
1. When the bot requests takeover — or you press **Take control** /
   **Take control** in the computer panel — the desktop becomes interactive for
   you.
2. Do the manual step (sign in, solve the challenge).
3. Press **Stop** / **I’m done** to hand control back. **Skip** / **Release**
   declines or ends the handoff.

### Screen privacy

**What it is.** A per-workspace policy that blacks out or blurs personal data in
screenshots before a bot’s model sees them, with a confidence threshold and a
never-redact allowlist.

**How to use it.**
1. Main menu → **Screen privacy**.
2. Turn on **Scrub screenshots for this workspace**.
3. Choose **Black box** or **Blur**, pick **What to redact**, set **Minimum
   confidence**, and list exceptions under **Never redact these (one per
   line)**.
4. **Save**. The policy applies to every bot in the workspace.

### Tool-output compaction

**What it is.** Tool results are compacted before reaching the model, keeping
errors and stack traces intact.

**How to use it.** Automatic. No configuration — long command output is trimmed
but failures stay legible to the bot.

### Worker health and stall monitoring

**What it is.** Monitoring of worker health and stalls, with in-app stack-repair
approvals.

**How to use it.**
1. Watch the worker indicator; **Start worker** appears when it is down.
2. **Restart API** / **Restart computer** in the main menu recover the stack.
3. Approve stack-repair prompts when the monitor proposes a fix.

---

## Workspaces and UI

### Multiple workspaces

**What it is.** Separate workspaces with fast switching and cross-workspace
search.

**How to use it.**
1. Open the **Workspace** picker → **New workspace**; **Rename** or **Delete
   workspace** from the same menu.
2. Switch workspaces from the picker; bots, memory, and integrations are scoped
   per workspace.
3. Use workspace search to find a bot or thread across all of them.

### Themes

**What it is.** Six built-in themes — Grok, ChatGPT, Claude, Gemini, Perplexity,
Copilot — each in light and dark, driven by contrast-checked design tokens.

**How to use it.** Main menu → **Themes**, pick one. Light/dark follows the
choice. Every surface recolors from the theme’s `--rk-*` tokens.

### Transcript following

**What it is.** The transcript follows new messages without yanking a reader who
has scrolled up, with a jump-to-latest control.

**How to use it.** Scroll up to read freely; new messages do not force you down.
Click the jump-to-latest control to return to the live end of the thread.

### Web UI language

**What it is.** The web and Electron-hosted UI in English, Deutsch, and 한국어.

**How to use it.** **Settings → Language**. The marketing homepage (`apps/www`)
is available in en/de/ko via footer links; other marketing pages stay English.

---

## Desktop and mobile

### Windows one-click shortcut

**What it is.** A **RocksteadyBot** desktop shortcut that installs Electron on
first launch, starts the local Docker stack, and opens a single-instance window.

**How to use it.**
1. Double-click the **RocksteadyBot** shortcut, or run
   `apps/desktop/scripts/open-desktop.cmd`.
2. First launch installs Electron if missing and writes the desktop shortcut.
3. Later launches start the stack if it is down and clear leftover RocksteadyBot
   processes on ports 3100 and 5173 without touching Docker or unrelated apps.
4. To pack or run Electron manually while the stack is up:
   `pnpm --filter @rakazo/desktop dev`.

### Server selection

**What it is.** On first run the desktop app asks whether to use the local stack
(`http://127.0.0.1:5173`) or connect to an existing server.

**How to use it.**
1. Pick **this computer** or enter a server URL. Public servers must use HTTPS;
   HTTP is accepted only for loopback and private LAN addresses.
2. The app verifies the health endpoint before saving.
3. **Change RocksteadyBot Server…** in the application menu reconnects later;
   closing that window without saving keeps the previous instance.
4. Dev overrides: `RAKAZO_WEB_URL` points the shell elsewhere without changing
   the saved instance; `RAKAZO_FORCE_SETUP=1` re-runs setup.

### Local sign-in

**What it is.** Optional local account with password reset (Supabase optional);
the first run can create the account.

**How to use it.** On the auth screen, create the account on first run, then sign
in. Use the forgot-password flow to reset. Supabase is only needed if you want
its managed auth.

### Mobile app

**What it is.** Point the Expo app at any self-hosted API origin, with a native
inbox and live desktop takeover.

**How to use it.**
1. In the mobile app, set the **API origin** to your server.
2. Use the native inbox for approvals and messages.
3. Take over a bot’s desktop from the phone when a run needs you.
4. Build and release steps: [docs/mobile-release.md](./mobile-release.md).
