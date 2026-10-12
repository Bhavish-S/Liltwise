# Architecture decisions

## 1. One TypeScript monorepo

**Decision:** Use pnpm workspaces for the site, desktop app, and two small shared packages.

**Reason:** A small team can share contracts and product rules without maintaining separate repositories. The website and desktop UI remain separate where their needs differ.

## 2. Next.js for the website and initial server APIs

**Decision:** Use the Next.js application for the public site and add server endpoints there when product flows need them.

**Reason:** This provides a simple beginning for accounts, event/script workflows, and server-side AI requests without prematurely operating a separate backend service.

## 3. Electron for the desktop companion

**Decision:** Use Electron with a React renderer and a narrow preload bridge.

**Reason:** The approved product uses TypeScript across website and desktop. Electron provides explicit controls for transparent and always-on-top windows across macOS and Windows. Its Chromium bundle increases app size and memory use, but avoids introducing Rust and another UI webview stack at the start.

## 4. Separate platform window behavior

**Decision:** Keep OS-specific behavior behind adapters as the overlay is developed.

**Reason:** macOS and Windows differ in focus, full-screen, Spaces/virtual desktop, and screen-capture behavior. A shared UI does not make those OS behaviors identical.

## 5. No universal screen-share invisibility promise

**Decision:** Treat capture exclusion as an empirical, per-platform/per-app property, not a product guarantee.

**Reason:** Apple marks the old window sharing exclusion setting as legacy and says not to use it to hide content from captures. Electron documents that newer ScreenCaptureKit-based Mac apps can still capture a content-protected Electron window. Windows offers `SetWindowDisplayAffinity` for a subset of capture paths, and Microsoft states it is not a security guarantee.

## 6. Node.js 24 LTS baseline

**Decision:** Use Node.js 24.21.0 in `.nvmrc` and document it as the recommended LTS version. Require Node 24.11 or newer in package metadata for the current dependency set.

**Reason:** Node's official release page marks the 24 line as LTS. The installed Node 26.9.0 is in Current status, so it is not the project's recommended baseline. Dependencies checked for this milestone accept Node 24.

**Reference:** [Node.js release status](https://nodejs.org/en/about/previous-releases) and [Node.js downloads](https://nodejs.org/en/download).

## 7. No speech capture in the foundation milestone

**Decision:** The app shell asks for no microphone permission and does not generate or synchronize speech.

**Reason:** Permission and data handling should be introduced alongside a user-visible speaking feature, not as unused foundation code.

## 8. One bundled renderer for the desktop workspace and overlay

**Decision:** Load the floating teleprompter from a second view in the existing renderer bundle, selected through a local query parameter. Keep the current script and reading settings in the Electron main process for the current session, and exchange them through narrow Zod-validated preload methods and events.

**Reason:** The two windows need the same app identity and shared script state, but they do not need separate builds or direct renderer-to-renderer communication. A single trusted main-process owner makes hide/reopen and intentional updates predictable while keeping filesystem, shell, and raw IPC access out of the renderer.

## 9. Server-side structured generation for the first Event Brain

**Decision:** Generate and refine scripts through a Next.js server endpoint using the OpenAI Responses API and Zod-based structured output. Keep the API key in server-only environment configuration, set `store: false`, and validate both requests and returned data. Store the event and draft only in the current browser session for now.

**Reason:** This gives the user a real event-specific draft and editable sections without exposing credentials, adding an account/database system, or tying the speaking workflow to a meeting provider. Uploaded source files are parsed on the server and discarded; only reviewed extracted text joins the generation request. A production launch still needs deployment-grade rate limits, provider/data-use disclosure, and careful logging and retention policies.

## 10. Same-computer website-to-desktop script transfer

**Decision:** Use a small HTTP companion service inside the Electron main process, bound only to `127.0.0.1` on a fixed documented port. Expose only health, one-time pairing, script transfer, and disconnect routes. Require an exact configured website `Origin`, the exact loopback `Host`, JSON, and explicit custom headers. Pair with an eight-digit cryptographically random code that expires after five minutes and is consumed once; issue a 256-bit bearer token held only in browser memory and only in desktop process memory. Revoke on disconnect, replacement pairing, expiry, or app shutdown. Keep one pending import at a time and require explicit approval in the desktop app before replacing its session draft.

**Reason:** The website and installed app run on the same computer, and the app already owns the teleprompter state. A loopback-only service lets the website send a structured script without adding accounts, cloud storage, manual copy/paste, or a new desktop runtime. CORS is only a browser boundary, so pairing tokens remain the actual authorization. Request schemas and script size are checked again in the desktop main process. The service does not accept arbitrary commands, file paths, or Electron IPC messages.

**Origin and browser limits:** Development allows only explicit localhost origins. Production origins are supplied through `LILTWISE_ALLOWED_WEB_ORIGINS` when building the desktop package; no production site domain is assumed. A remote HTTPS site may require the user's browser to grant local-network access. Chrome's current Local Network Access permission can block the request before the companion receives it; users must use the normal browser permission prompt. The bridge will report connection failures without advising users to weaken browser security. This HTTP design is scoped to same-device loopback use and does not protect against a compromised local account or malicious software already running as the user.

**References:** [Electron security](https://www.electronjs.org/docs/latest/tutorial/security/), [Electron context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation), [Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access).

## 11. Provider-independent adaptive alignment core and simulator

**Decision:** Implement transcript-to-script alignment as deterministic local TypeScript domain logic. Keep a typed transcript/control event boundary that future providers can call. Add a clearly labelled simulator in the existing floating teleprompter for interim/final text, pause, skips, repeats, divergence and manual resynchronization. Do not enable microphone capture in this milestone.

**Reason:** Alignment thresholds and recovery behavior need validation against repeatable input before real audio, permission prompts, platform APIs, network services, or provider costs complicate debugging. Interim hypotheses may show a preview but cannot advance confirmed position. A bounded forward search allows small omissions and confident skips; stale updates cannot move backwards; repeated passages hold position; uncertain matches require more evidence or explicit resynchronization.

### Speech recognition options for Milestone 5B

- **Browser Web Speech API:** smallest application integration and no bundled model, but browser support is not uniform. `SpeechRecognition` is not Baseline, and some browser implementations send audio to a remote recognition service and do not work offline. Electron Chromium behavior still needs checks on each target OS/version. Do not rely on it as the cross-platform product engine. [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).
- **Local/offline model:** `whisper.cpp` has a permissive open-source runtime, real-time microphone examples, and multilingual model choices. Its project lists model tradeoffs (for example, base about 142 MiB on disk / 388 MB memory and small about 466 MiB / 852 MB in its current model table). It avoids sending audio off-device, but adds native build/packaging work, downloadable model size, CPU/battery load, and latency that must be measured on both macOS and Windows. [whisper.cpp project and model table](https://github.com/ggml-org/whisper.cpp).
- **Remote streaming:** an authenticated Liltwise server can mint a short-lived, narrowly scoped ephemeral client credential, then let the desktop connect to a streaming transcription service without receiving the long-lived provider key. OpenAI Realtime documents ephemeral client secrets and transcription sessions. This should offer one common integration across platforms and avoid shipping large models, but audio leaves the computer, connectivity affects latency, and usage creates variable service cost and abuse risk. The server must authenticate users, limit session duration/starts, enforce quotas, and never log audio or credentials. Obtain explicit microphone and data-transfer consent before starting. [OpenAI Realtime transcription](https://platform.openai.com/docs/guides/realtime-transcription), [ephemeral client secrets](https://platform.openai.com/docs/api-reference/realtime-sessions).
- **Native OS recognition:** Apple Speech offers language-specific recognizers and can support on-device processing only when the recognizer/device says it is available; some locales require network. A Windows counterpart would be a separate adapter with different availability and behavior. This adds platform-specific native integration and cannot be the only common engine. [Apple SFSpeechRecognizer](https://developer.apple.com/documentation/speech/sfspeechrecognizer), [on-device availability](https://developer.apple.com/documentation/speech/sfspeechrecognizer/supportsondevicerecognition).

**Recommendation and plan:** Keep `AdaptiveSpeakingSession` as the platform/provider-neutral core. For 5B, first run a small consent-based provider spike that measures incremental transcript latency, final correction behavior, language coverage (including Kannada), and end-to-end cost against representative speech on both target operating systems. Prototype remote streaming using server-minted ephemeral credentials only if the user accepts audio leaving the device; separately benchmark whisper.cpp base/small as the offline alternative on the actual target hardware. Select the initial provider only after accuracy/latency and privacy results are reviewed. Neither this decision nor 5A authorizes microphone capture or audio transmission by itself.
