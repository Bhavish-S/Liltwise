# Liltwise engineering guide

## Product direction

- Build a cross-platform product. The website uses Next.js, React, and TypeScript; the desktop companion uses Electron, React, and TypeScript.
- macOS and Windows are first-release targets. Linux is a later possibility, not a reason to block macOS or Windows work.
- The desktop app owns operating-system capabilities such as floating windows. Keep platform-specific behavior behind a narrow adapter when implementations differ.
- Keep the speaking experience independent of meeting providers. Do not claim that an overlay is invisible to every screen-sharing or recording application.

## Code standards

- Use TypeScript in application and shared package code. Keep modules small and name concepts in plain language.
- Put reusable request/response contracts in `packages/contracts` and reusable product rules in `packages/domain`. Avoid packages that have no real consumer.
- Validate data at trust boundaries, including IPC messages and server requests. Prefer explicit schemas over trusting TypeScript types at runtime.
- Keep website and desktop interfaces separate unless a UI component is genuinely reusable. Share data rules before visual components.
- Do not add dependencies without a concrete need. Pin the package manager in the root manifest and keep the lockfile committed.

## Security and privacy

- Never put API keys, signing credentials, or other secrets in browser or renderer code. AI provider calls belong on the server.
- Keep Electron `contextIsolation` and renderer sandboxing enabled, with `nodeIntegration` disabled. Expose only narrow, typed preload functions; never expose raw `ipcRenderer`, arbitrary shell commands, or unrestricted filesystem access.
- Restrict navigation and new-window creation in Electron. Treat user-supplied event guides and scripts as untrusted text.
- Ask for microphone access only when the user starts a speech feature. Do not record or retain audio by default.
- Do not add microphone capture, speech generation, live speech synchronization, or meeting integrations without an approved milestone.
- Do not implement or advertise universal screen-share invisibility.
- Keep credentials and local environment files out of Git. Use `.env.example` only for non-secret variable names and descriptions.

## Verification

- Run the relevant type check, lint, and build after code changes. Add or update automated tests when behavior warrants them.
- Document manual checks in `docs/TESTING.md`; distinguish checks actually run from checks that require another operating system or real-device testing.
- Never claim Windows behavior has been verified on macOS.
- Do not run Git operations from the parent PRIZ repository. The Liltwise repository root is this folder.

## Documentation upkeep

- Update `docs/ARCHITECTURE.md` and record the reason in `docs/DECISIONS.md` when architecture or trust boundaries change.
- Update `docs/ROADMAP.md` when milestone ordering or scope changes.
- Keep beginner setup and verification commands accurate in `README.md` and `docs/TESTING.md`.
