# Liltwise

**Your AI Co-Presenter**  
*Stay present. Never lose your words.*

Liltwise is a website for preparing event-specific speaking scripts and a macOS/Windows desktop companion for presenting them. The website now includes an initial Event Brain workspace: enter event details, review extracted event-guide text, generate a structured script through a server-side OpenAI connection, edit it, and export Markdown or plain text. Script drafts are held in the browser session and are not saved to an account or database.

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

For script generation, copy `apps/site/.env.example` to `apps/site/.env.local` and set `OPENAI_API_KEY` and `OPENAI_MODEL` in that local file. Keep the key private: never paste it into chat or commit `.env.local`. The API key is read only by the Next.js server. If the values are absent, the event form and document extraction still work, while generation returns a clear setup message.

The package-manager store is kept inside this repository so setup does not place dependency files elsewhere on the computer. It is ignored by Git.

pnpm uses the hoisted workspace layout required by Electron Forge. Only the approved `esbuild` and `electron-winstaller` dependency setup scripts are enabled; other dependency scripts remain blocked unless reviewed.

## Run the applications

Start the website:

```sh
pnpm dev:site
```

Then open <http://localhost:3000>.

Choose **Prepare an event** to use Event Brain. Uploaded TXT, Markdown, PDF, and DOCX guides are parsed on the server, returned as text for review, and are not kept as files. When you generate or refine a script, the event details and guide text are sent to OpenAI. The application requests that the provider not store the response, but this does not replace review of the provider's current data terms. The current app does not save drafts after the browser session.

Start the desktop companion in a separate terminal:

```sh
pnpm dev:desktop
```

The desktop command launches Electron with its React welcome screen. Close the app window to end the desktop session.

## Checks and builds

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

See [docs/TESTING.md](docs/TESTING.md) for what these checks do and which platform checks still need Windows hardware or a Windows CI runner.

## Project map

- `apps/site` — public product website and the future home for initial server-side APIs.
- `apps/desktop` — Electron main process, narrow preload bridge, and React renderer.
- `packages/contracts` — runtime-validated shared contracts.
- `packages/domain` — reusable product concepts and rules.
- `docs` — product, architecture, decisions, roadmap, and verification notes.
