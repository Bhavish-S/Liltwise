# Roadmap

## Milestone 1 — Foundation and application shells

- Establish the pnpm TypeScript monorepo.
- Create the public Next.js landing page.
- Create the secure Electron main/preload/renderer shell.
- Document architecture, setup, privacy, and verification.

## Milestone 2 — First real floating teleprompter

- Display manually entered or sample script text in an overlay.
- Add basic movement, scrolling, text-size, and interaction controls.
- Implement platform-specific window behavior behind adapters.
- Verify basic behavior on a Mac and a Windows runner.

## Milestone 3 — Accounts and event/script workspace

- Add real account access, persistent event information, guide input, and editable saved scripts.
- Keep data access behind secure server-side APIs.

## Milestone 4 — Event-specific speech generation

- Generate drafts on the server using event context.
- Let users review and edit a draft before presenting it.
- Keep provider credentials server-side and disclose relevant data handling.

## Milestone 5 — Adaptive speaking engine

- Add permission-based microphone capture and live transcription.
- Align changing transcripts with script text and handle pauses, skips, corrections, and repeated phrases.
- Do not record or retain audio by default.

## Milestone 6 — Privacy and platform validation

- Test window capture behavior across selected macOS and Windows versions and meeting/share modes.
- Document verified outcomes and limitations. Do not promise universal capture exclusion.

## Milestone 7 — Packaging and production launch

- Build signed macOS and Windows installers, implement update delivery, and validate clean installation and upgrade paths.
- Deploy the website and APIs, add monitoring and backups, and add billing when the product is ready to charge users.

## Later — Linux and integrations

Consider Linux only after the macOS and Windows experience is validated. Add meeting-provider integrations as separate adapters, with the core script and speaking experience continuing to work without them.
