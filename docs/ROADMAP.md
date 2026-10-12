# Roadmap

## Milestone 1 — Foundation and application shells

- Establish the pnpm TypeScript monorepo.
- Create the public Next.js landing page.
- Create the secure Electron main/preload/renderer shell.
- Document architecture, setup, privacy, and verification.

## Milestone 2 — First real floating teleprompter

- Implemented a session-based script editor, word and reading-time estimates, and a local floating preview window.
- Implemented window movement/resizing, time-based auto-scroll, manual scroll, font-size and surface-opacity controls, reset, hide, and explicit script updates.
- macOS window level and translucency are implemented but still need manual capture, full-screen, and Spaces validation. Windows behavior and packaging need a Windows runner.
- Next: validate the overlay in common macOS meeting/share scenarios and run the manual acceptance checks on Windows before calling this milestone fully platform-verified.

## Milestone 3 — AI Event Brain (initial session-only workflow)

- Implemented event details, guest and agenda inputs, server-side extraction for TXT/Markdown/PDF/DOCX, a reviewable guide field, and structured server-side OpenAI generation/refinement.
- Implemented script section editing, full or section regeneration, fact-confirmation prompts, and Markdown/plain-text export.
- Drafts are not saved to accounts or a database; the user must export to keep a copy. An OpenAI key and model must be configured locally for live generation.
- Before a public launch, add login and persistent storage only after choosing retention behavior, deployment-grade rate limiting, monitoring, provider data-use disclosures, and production secrets management.

## Next — Saved accounts and event/script workspace

- Add account access and persistent event information and scripts behind secure server APIs.
- Decide how users can delete their data and how long event guides and generated scripts are retained.

## Next — Adaptive Speaking Engine

- Request microphone access only when the speaker starts the feature.
- Align live transcript updates with script sections and handle pauses, skips, corrections, and repeated phrases.
- Do not record or retain audio by default.

## Privacy and platform validation

- Test window capture behavior across selected macOS and Windows versions and meeting/share modes.
- Document verified outcomes and limitations. Do not promise universal capture exclusion.

## Packaging and production launch

- Build signed macOS and Windows installers, implement update delivery, and validate clean installation and upgrade paths.
- Deploy the website and APIs, add monitoring and backups, and add billing when the product is ready to charge users.

## Later — Linux and integrations

Consider Linux only after the macOS and Windows experience is validated. Add meeting-provider integrations as separate adapters, with the core script and speaking experience continuing to work without them.
