# @an-tg/desktop

Electron shell that packages the whole platform (api, worker, web) into
one double-click Windows installer — no terminal, no `pnpm install`, no
`git clone` for the end user.

On launch it starts the api/worker/web as local child processes (same as
`pnpm dev`, just spawned by Electron instead of turbo), using a per-install
SQLite file and random secrets stored under the OS user-data directory,
then opens a window pointed at the local web server.

Lighter than the sibling `an-whatsapp-platform` desktop build: MTProto
(GramJS) is a plain TCP/TLS client that runs in-process inside api/worker,
so there's no browser-automation service or Chromium bundle needed here.

## Building the installer

From the repo root:

```bash
pnpm install
pnpm --filter @an-tg/desktop dist:win
```

This runs `build.js` (builds every workspace app, `pnpm deploy`s the
backend services into flat/non-symlinked `resources/*` folders, copies the
Next.js standalone build, bundles a real `node.exe` for spawning child
processes, and produces a pre-migrated template SQLite db), then runs
`electron-builder` to produce `release/AN Telegram Platform Setup
<version>.exe` — the NSIS installer to hand to users.

### Why a bundled node.exe, not the packaged Electron binary

Spawning child processes via `process.execPath` (the packaged, renamed
Electron binary running as `ELECTRON_RUN_AS_NODE`) makes the installed app
launch several unsigned copies of *itself* — a process-spawns-copy-of-
itself pattern that reads as process self-replication to Windows
Defender's behavior heuristics. On the sibling `an-whatsapp-platform`
desktop app this got silently killed on a real install, surfacing only as
a bare `spawn ... ENOENT` with no visible antivirus message. `build.js`
instead bundles the build machine's own `node.exe` into `resources/node/`,
and `main.js` spawns children through that — a real, unmodified `node.exe`
has none of that baggage.

## Local test run without packaging

```bash
pnpm --filter @an-tg/desktop build:resources
cd apps/desktop && npx electron .
```

## Diagnosing a startup failure

A packaged GUI-subsystem `.exe` has no console attached on Windows, so
nothing written to stdout/stderr is visible anywhere. `main.js` logs every
startup step to `<userData>/main.log` from its very first line instead —
check that file first if the app doesn't open a window.

## Data locations

Everything lives under the OS per-user app-data directory (e.g.
`%APPDATA%\AN Telegram Platform` on Windows): the SQLite db, uploaded
attachments, and generated secrets (`secrets.json`, created on first
launch — never shipped in the installer, includes the AES-256-GCM key
that encrypts MTProto session strings at rest).
