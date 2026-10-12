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
