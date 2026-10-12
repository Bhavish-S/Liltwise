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

Same-computer browser ──HTTP over loopback──> Electron main-process companion
       └── one-time pairing and one explicitly approved script import
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

## Adaptive Speaking Engine core (Milestone 5A)

- `packages/domain/src/adaptive-speaking.ts` owns a deterministic, provider-independent alignment session. It receives stable ordered section IDs, transcript updates, optional timestamps/confidence, and pause/resume/stop/resynchronize controls. Shared Zod contracts validate the inputs and every result at runtime.
- Script and transcript text are tokenized with Unicode-aware word segmentation and NFKC/case normalization. The displayed script remains the original string. A bounded forward window, short edit-distance matching, and useful-word checks reduce common-word false matches. A small backward search labels repeated passages while keeping confirmed progress in place. This is near-verbatim lexical matching; it does not understand broad semantic paraphrases or replace words based on meaning.
- Interim recognition can preview a phrase but keeps confirmed progress unchanged. Final updates move progress only when the lexical match score and, when supplied, provider-confidence threshold pass. The result confidence is the matcher score; no provider score is fabricated. Stale timestamps are ignored, uncertain updates hold position, and repeated divergence requests manual recovery. A pause never means the speech is complete.
- The floating renderer derives temporary paragraph IDs from the current script string, runs this same domain session for simulator input, highlights a phrase, and smoothly scrolls after confirmed advances. The simulator emits transcript-shaped events; a future microphone adapter should feed the same `AdaptiveSpeakingSession.apply` input without replacing the matcher.
- Current transcript inputs expect a complete current-segment hypothesis, not raw append-only provider deltas, and lack session/event/segment identities. A future provider adapter must accumulate revisions, reconcile completed turns by provider ID/order, and add safe deduplication before live wiring; receive timestamps alone do not solve out-of-order turns.
- Milestone 5A does not capture a microphone, request permission, record, or transmit audio. Progress is advisory and can be overridden by ordinary manual scrolling.

See [Transcription provider evaluation](TRANSCRIPTION_PROVIDER_EVALUATION.md) for the dated provider comparison, event-adapter design, privacy policy, benchmark plan, and official references. The first proposed live candidate is OpenAI's transcription-only Realtime API behind a consented, server-credentialed adapter; it is not a permanent vendor commitment. `whisper.cpp` remains the local/offline comparison. No provider is wired and no microphone capability is enabled by that proposal.

The site and desktop UI are separate because their interaction patterns differ. Share contracts and business rules first; only share visual components if that later reduces real maintenance work.

## Desktop security boundary

### Website-to-desktop transfer

When the user chooses **Connect Website**, the Electron main process starts a small HTTP service bound only to `127.0.0.1:43129`. It is not exposed to the local network. The website connects to that computer's loopback address; scripts do not pass through a Liltwise server or get saved to an account by this bridge.

The desktop app displays a cryptographically random eight-digit code for five minutes. The website submits the code to the exact allowed origin and receives a random bearer token once. The website keeps that token in React memory only; the Electron process keeps only a one-way token digest. The session expires after eight hours and is cleared when the app closes, a replacement pairing is created, or either side disconnects. The pairing code permits one successful use and has a small failed-attempt limit. Only one incoming script can wait for review. The desktop validates it again, shows a preview, and replaces the workspace/teleprompter script only after the user chooses **Review and load**.

The bridge accepts only exact configured browser origins, the expected loopback Host, JSON, a named client header, and bounded schema-valid requests. It has no route for commands, arbitrary files, or general IPC. CORS is not authorization by itself; the pairing token authorizes transfers. HTTP on loopback is intended only for this same-computer use. It does not defend against a compromised browser page with an already paired token or malware running as the same local user.

Development builds allow `http://localhost:3000` and `http://127.0.0.1:3000`. Production desktop packages must be built with `LILTWISE_ALLOWED_WEB_ORIGINS` set to a comma-separated list of exact HTTPS website origins (for example, the official origin once finalized). Invalid configuration leaves the feature unavailable with an in-app diagnostic rather than opening a broader listener. Keep the website origin list narrow and never include URL paths or wildcards.

Browser vendors may require a local-network permission before a public website can contact loopback. This permission behavior varies by browser/version and must be tested on real macOS and Windows installations. Explain permission denial to users; do not recommend weakening browser security. The service does not claim to be invisible to screen sharing or recording.

- Electron's main process owns window creation and operating-system access.
- The renderer is a sandboxed UI. It has no Node.js integration.
- A preload script exposes only named, typed operations. It does not expose raw IPC, shell execution, or arbitrary filesystem access.
- Zod validates data when it crosses the process boundary; TypeScript types alone disappear at runtime.
- The loopback companion server lives in the main process and has its own origin, host, request-size, and script validation. Website data does not enter the Electron renderer until the user approves the pending import.
- Navigation and new-window creation are restricted. Remote content is not loaded into a privileged renderer.

## Platform-specific behavior

The desktop window shell should keep platform-specific behavior behind a small adapter. macOS and Windows differ in window collections, focus behavior, full-screen behavior, and capture semantics. The first shell does not implement overlay-specific behavior; the first teleprompter milestone should add and test those adapters on each operating system.

Neither platform offers a universal guarantee that a window will be absent from every screen-sharing or recording path. Test the actual meeting application, capture mode, OS version, and display configuration before documenting behavior. See [DECISIONS.md](DECISIONS.md).

## Server and secrets

Next.js server endpoints currently handle document extraction and website-side generation. Store AI provider secrets only in server-side environment variables. When users, events, and scripts need durable storage, add a managed database and authentication solution behind server APIs. Separate services are not needed until scale or team boundaries justify them.

## Meeting integrations

The speaking engine should consume provider-neutral script, transcript, and timing events. Meeting-specific integrations can later adapt supported provider APIs to those events. This keeps the core experience usable when no meeting integration is available.
