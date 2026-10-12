# Architecture

## Shape of the product

```text
Browser ──HTTPS──> Next.js website and server endpoints
                         ├── server-only OpenAI Responses API calls
                         └── temporary, in-memory rate limits (per process)

Electron desktop app ──HTTPS──> the same authenticated server APIs
       │
       ├── main process: operating-system windows and privileged work
       ├── preload: small, validated bridge
       └── renderer: React user interface
```

The website is the public product site and, in later milestones, the account and script workspace. A browser page cannot float above unrelated desktop applications. The installed Electron application owns the floating teleprompter and any future operating-system integrations.

The first Event Brain flow is a session-only preparation tool. It validates event details with shared Zod schemas, lets a speaker review their generated draft, and can download Markdown or plain text. It does not require login or persist event data. The OpenAI key and model are read from server-only `OPENAI_API_KEY` and `OPENAI_MODEL` environment variables; never expose them through `NEXT_PUBLIC_*` or renderer code. The server calls the Responses API with structured Zod output, `store: false`, a bounded request size and a timeout. A small in-memory request limiter is a development safeguard, not a distributed production control. Before public launch, add deployment-level abuse controls, monitoring and an appropriate persistent rate-limit service.

Guide upload accepts bounded TXT, Markdown, PDF and DOCX files. Files are parsed on the server without writing them to disk. Only extracted plain text is returned for the speaker to review. PDFs with scanned images need OCR, which is not included. Generation sends event fields and reviewed guide text to OpenAI. There is no account, database or application-side draft storage in this milestone. The server asks the provider not to store generation responses, but users still need a clear provider data-use notice and review of applicable provider terms.

## Monorepo layout

- `apps/site`: Next.js, React, TypeScript, and the initial server-side API location.
- `apps/desktop`: Electron, React, TypeScript, Vite, and Electron Forge packaging.
- `packages/contracts`: Zod schemas and shared IPC/API/event/script data shapes.
- `packages/domain`: provider-independent product types and rules shared by the website and desktop app.

## Desktop teleprompter

- The main desktop workspace and floating teleprompter use the same bundled renderer. Electron loads the teleprompter view from a local query parameter, so the app has one renderer entry and one packaged asset set.
- The Electron main process owns the floating window and current script/settings for the lifetime of the app. Hiding the window preserves that state; reopening or explicitly updating sends validated script/settings through named IPC channels.
- The preload exposes only typed methods for opening, updating, hiding, reading window status, and receiving teleprompter data. Zod schemas validate requests and event payloads. IPC handlers also check which of the two known application windows sent the request.
- The overlay uses a frameless, transparent, resizable BrowserWindow with an always-on-top level. macOS adds its supported floating level and under-window vibrancy; Windows uses its default topmost level. Both still require hands-on testing on the target OS.
- The editor draft is session-only. There is no microphone access, audio recording, speech recognition, cloud sync, or universal screen-capture exclusion.

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

Next.js server endpoints currently handle document extraction and website-side generation. Store AI provider secrets only in server-side environment variables. When users, events, and scripts need durable storage, add a managed database and authentication solution behind server APIs. Separate services are not needed until scale or team boundaries justify them.

## Meeting integrations

The speaking engine should consume provider-neutral script, transcript, and timing events. Meeting-specific integrations can later adapt supported provider APIs to those events. This keeps the core experience usable when no meeting integration is available.
