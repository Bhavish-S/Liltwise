# Architecture

## Shape of the product

```text
Browser ──HTTPS──> Next.js website and initial server endpoints
                         │
                         ├── future database and authentication provider
                         └── future server-only AI provider calls

Electron desktop app ──HTTPS──> the same authenticated server APIs
       │
       ├── main process: operating-system windows and privileged work
       ├── preload: small, validated bridge
       └── renderer: React user interface
```

The website is the public product site and, in later milestones, the account and script workspace. A browser page cannot float above unrelated desktop applications. The installed Electron application owns the floating teleprompter and any future operating-system integrations.

## Monorepo layout

- `apps/site`: Next.js, React, TypeScript, and the initial server-side API location.
- `apps/desktop`: Electron, React, TypeScript, Vite, and Electron Forge packaging.
- `packages/contracts`: Zod schemas and shared IPC/API data shapes.
- `packages/domain`: provider-independent product types and rules shared by the website and desktop app.

The site and desktop UI are separate because their interaction patterns differ. Share contracts and business rules first; only share visual components if that later reduces real maintenance work.

## Desktop security boundary

- Electron's main process owns window creation and operating-system access.
- The renderer is a sandboxed UI. It has no Node.js integration.
- A preload script exposes only named, typed operations. It does not expose raw IPC, shell execution, or arbitrary filesystem access.
- Zod validates data when it crosses the process boundary; TypeScript types alone disappear at runtime.
- Navigation and new-window creation are restricted. Remote content is not loaded into a privileged renderer.

## Platform-specific behavior

The desktop window shell should keep platform-specific behavior behind a small adapter. macOS and Windows differ in window collections, focus behavior, full-screen behavior, and capture semantics. The first shell does not implement overlay-specific behavior; the first teleprompter milestone should add and test those adapters on each operating system.

Neither platform offers a universal guarantee that a window will be absent from every screen-sharing or recording path. Test the actual meeting application, capture mode, OS version, and display configuration before documenting behavior. See [DECISIONS.md](DECISIONS.md).

## Server and secrets

For the initial product, Next.js server endpoints can handle website and desktop requests. Store AI provider secrets only in server-side environment variables. When users, events, and scripts need durable storage, add a managed database and authentication solution behind server APIs. Separate services are not needed until scale or team boundaries justify them.

## Meeting integrations

The speaking engine should consume provider-neutral script, transcript, and timing events. Meeting-specific integrations can later adapt supported provider APIs to those events. This keeps the core experience usable when no meeting integration is available.
