# Liltwise

**Your AI Co-Presenter**  
*Stay present. Never lose your words.*

Liltwise is planned as a website for preparing event-specific scripts and a macOS/Windows desktop companion for presenting them. The current milestone creates the website and desktop application shells; it does not yet generate speeches, listen to a microphone, or provide the floating teleprompter.

## Prerequisites

- Node.js **24.21.0 LTS** (the repository's `.nvmrc` records this choice)
- pnpm **11.24.0**
- macOS for the Mac desktop development/build. Windows builds and behavior require a Windows runner for reliable verification.

Node 24 is the maintained LTS line selected for this project. The installed Node 26 line is currently newer but not LTS. The application dependencies support Node 24; use Node 24 for consistent project work.

## Install dependencies

From this folder, run:

```sh
pnpm install --store-dir ./.pnpm-store
```

The package-manager store is kept inside this repository so setup does not place dependency files elsewhere on the computer. It is ignored by Git.

pnpm uses the hoisted workspace layout required by Electron Forge. Only the approved `esbuild` and `electron-winstaller` dependency setup scripts are enabled; other dependency scripts remain blocked unless reviewed.

## Run the applications

Start the website:

```sh
pnpm dev:site
```

Then open <http://localhost:3000>.

Start the desktop companion in a separate terminal:

```sh
pnpm dev:desktop
```

The desktop command launches Electron with its React welcome screen. Close the app window to end the desktop session.

## Checks and builds

```sh
pnpm lint
pnpm typecheck
pnpm build
```

See [docs/TESTING.md](docs/TESTING.md) for what these checks do and which platform checks still need Windows hardware or a Windows CI runner.

## Project map

- `apps/site` — public product website and the future home for initial server-side APIs.
- `apps/desktop` — Electron main process, narrow preload bridge, and React renderer.
- `packages/contracts` — runtime-validated shared contracts.
- `packages/domain` — reusable product concepts and rules.
- `docs` — product, architecture, decisions, roadmap, and verification notes.

No GitHub remote has been contacted beyond configuring the local `origin`; this project has not been pushed.
