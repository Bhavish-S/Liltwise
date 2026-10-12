# Testing and verification

## Automated checks

From the repository root:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- `lint` runs ESLint across the site and shared packages.
- `typecheck` runs TypeScript checks for the workspace applications and shared packages.
- `test` runs adaptive-alignment and shared domain tests, Event Brain validation/upload/generation tests, and desktop companion-server tests with Node's built-in test runner. Provider calls are mocked; a live AI request is not part of automated tests.
- `build` creates a production website build and packages the local Electron app for the current macOS architecture. It does not sign or notarize an installer.

## Run locally

Website:

```sh
pnpm dev:site
```

Open <http://localhost:3000>.

To test actual generation, create `apps/site/.env.local` from `apps/site/.env.example`, fill in a valid `OPENAI_API_KEY` and `OPENAI_MODEL`, restart the site, and use **Prepare an event**. Never share or commit the API key. TXT, Markdown, PDF and DOCX extraction can be tested without an API key.

Desktop app, in another terminal:

```sh
pnpm dev:desktop
```

The Electron app should show the Liltwise script workspace. Use **Open floating teleprompter** to open its separate reading window.

## Manual checks for this milestone

1. Check the landing page at a wide desktop width and a narrow mobile width. Navigation should reach the matching page sections.
2. Confirm the download section says installers are not available yet; no button should imply that an installer exists.
3. Launch the Electron app, confirm the script workspace loads, and close the window. No microphone permission prompt should appear.
4. Confirm the renderer can call only documented methods on `window.liltwise`. No raw Electron or filesystem API should be exposed to `window`.
5. If packaging for Windows, run the Windows package and smoke checks on a Windows runner. A macOS build is not evidence that the Windows app works.

## Event Brain checks

1. Open **Prepare an event** and fill the required event details. Confirm custom role/tone fields require text when selected.
2. Upload a TXT, Markdown, text-based PDF, and DOCX guide separately. Review the extracted plain text and adjust it before generation. Confirm a scanned/image-only PDF explains that OCR is unavailable.
3. Without `OPENAI_API_KEY` and `OPENAI_MODEL`, submit the form and confirm a setup message appears without exposing any secret.
4. With locally configured values, generate a draft; check section editing, full-script export, per-section export, full regeneration confirmation, and section-only regeneration. Confirm unaffected edited sections remain intact.
5. Confirm closing/reloading the browser loses the draft. This is the expected session-only behavior for this milestone.
6. Never use confidential event material during development unless the speaker has reviewed the provider and deployment data-handling terms.

Automated document extraction tests ran against generated in-memory TXT, PDF and DOCX fixtures. Live OpenAI generation has not been exercised unless a separately recorded manual test says otherwise. Production deployment rate limiting and provider privacy settings remain to be validated before a public launch.

### Milestone 3 checks run

- `pnpm lint` — passed.
- `pnpm typecheck` — passed for all workspace packages and applications.
- `pnpm test` — passed: 4 domain tests and 13 Event Brain tests, with no API key or provider charges.
- `pnpm build` — passed: Next.js production build and Electron macOS arm64 package.
- The local website server started successfully. The project owner reports that the Event Brain layout and document-extraction workflow were manually reviewed; this report does not independently reproduce that visual check.
- No OpenAI credentials were configured, so live generation was not tested.

## Teleprompter milestone checks

1. Run `pnpm dev:desktop`, edit the sample speech, and confirm the word count changes.
2. Open the floating teleprompter. Confirm the script appears, can be selected, and the window can be moved and resized. On macOS, verify that it stays above ordinary windows. Repeat these checks on Windows before claiming Windows support.
3. Change font size, surface opacity, and preview pace. Confirm the script remains readable and opacity changes the window surface without fading the text.
4. Start auto-scroll, pause it, manually scroll, and reset to the top. Confirm the position indicator follows manual and automatic scrolling.
5. Edit the script in the workspace and choose **Update floating script**. Confirm the floating text updates and returns to its beginning.
6. Hide the floating window, reopen it, and confirm the most recent script/settings remain. Confirm the workspace status reflects visible/hidden/closed state.
7. Clear the script and confirm the workspace disables opening and shows an explanation; the floating window should display its empty state if updated with an empty draft.
8. Confirm no microphone prompt appears and do not assume the overlay is omitted from any screen share or recording.

## Adaptive Speaking Engine simulator (Milestone 5A)

The floating teleprompter now includes **Speech tracking simulator · Simulation · No microphone**. It feeds typed interim/final transcript events into the same shared `AdaptiveSpeakingSession` that a future provider adapter will call. It does not access the microphone or send speech anywhere.

1. Open a script with at least two paragraphs, then open the floating teleprompter and expand the simulator if it is collapsed.
2. Choose **Interim preview**. Confirm the possible phrase is blue-highlighted and the confirmed progress percentage does not move.
3. Choose **Confirm next phrase** or **Play sequence**. Confirm a confident match highlights the phrase, advances progress, and scrolls it into view.
4. Choose **Pause**. Confirm the status says the position is held and does not indicate that the speech is complete. Use **Resume**, then **Confirm next phrase** or **Play sequence**.
5. Choose **Skip paragraph**. Confirm a confident later passage moves ahead and reports the skip.
6. Confirm a phrase, then choose **Repeat last sentence**. Confirm the engine identifies the repeated passage but does not move the confirmed position backwards.
7. Enter an unrelated line under **Unmatched phrase** and choose **Send phrase** repeatedly. Confirm uncertain/diverged status holds position and eventually requests recovery. Select a paragraph under **Recovery passage**, then choose **Resynchronize**.
8. Choose **Reset**. Confirm the progress, highlight, and simulator status return to the beginning.
9. Verify ordinary Play/Pause/Reset auto-scroll remains available, script text remains selectable, and no microphone permission prompt appears.

Automated matcher tests cover matching, Unicode, corrections/overlap, staleness, pauses, skips, repeats, uncertainty, resynchronization, empty scripts, boundaries and determinism. They do not establish real transcription accuracy or real-device microphone behavior.

### Milestone 5A verification record — 2026-10-12

- `pnpm dev:desktop` launched the workspace renderer and floating teleprompter successfully. Development diagnostics reported `rootChildCount: 1` for the workspace; the renderer console showed both views loaded without application errors.
- Manual UI checks used the built-in 75-word sample and left that script text unchanged. Interim preview held confirmed progress; a final match advanced it. Prepared playback advanced through script sections; pause held position, resume continued playback, and simulator reset restored both alignment and scroll position to the beginning.
- Skip, repeat, unmatched phrase, three-step uncertainty/divergence/recovery, and manual resynchronization controls produced their corresponding visible states. The UI was labelled **SIMULATION · NO MICROPHONE** and no microphone prompt appeared.
- Port 43129 was initially held by an older Liltwise process running the project’s packaged app. Its startup preceded the current package rebuild and its open renderer lacked the simulator. It was quit through the app menu; afterward `pnpm dev:desktop` bound the companion service successfully. The existing project website server remained on port 3000; port 5173 was free before the development launch.
- The earlier Electron binary change coincided with Electron’s first-run runtime download (`Downloading Electron binary...`). Electron 44 downloads its matching runtime when first invoked; the next development launch started without another download. No Forge or Vite port configuration change was needed.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (28 domain, 13 site, 9 companion tests; 50 total), `pnpm build` (website plus macOS arm64 package), and `git diff --check` passed. These checks do not verify Windows behavior.
- The engine uses deterministic token/edit-distance matching. It tolerates punctuation, capitalization, small omissions and recognition errors, but does not understand broad semantic paraphrases. Real speech recognition, microphone permission behavior, and Windows GUI behavior remain untested.

## Milestone 5B provider validation plan

Before microphone work, compare browser speech recognition (limited and potentially remote), local `whisper.cpp` (model download, CPU/memory and installer footprint), and remote streaming (consent, latency, network, cost, server-minted ephemeral credentials and abuse limits). Test latency, corrected interim results, English and Kannada, CPU/battery, session shutdown and explicit permission on both macOS and Windows. Never send the long-lived provider key to Electron. Document whether audio leaves the device and retain neither audio nor transcripts by default unless the user explicitly chooses a documented feature.

## Website-to-desktop transfer checks

Automated desktop tests send HTTP requests to a loopback-only server on an ephemeral port. They cover the configured Origin and Host checks, pairing and session expiry, failed pairing limits, token revocation, transfer schema checks, duplicate transfer IDs, pending import storage, and dismissal. The main-process approval handler is verified by code review and the production build, but automated tests do not exercise user confirmation or the complete website-to-Electron UI handoff. These tests also do not exercise a real browser's local-network permission prompt.

For a manual same-computer check:

1. Start the website and desktop app on the same computer. In a development build, use `http://localhost:3000` or `http://127.0.0.1:3000`.
2. Create a script in the website with **Write a script manually** (no AI key required), or generate one if credentials are available. Edit a section and choose **Connect to Desktop**. If your browser asks whether the site may access devices on your local network, allow it only if you want this transfer. If the browser blocks it, record browser/version and the exact message; do not disable browser protections.
3. In Electron, choose **Connect Website** and enter the displayed eight-digit code in the website. Confirm the pairing code disappears after success and the website says it is paired.
4. Choose **Send to Desktop**. Confirm the Electron workspace shows a preview and that no script changes until **Review and load** is selected. Approve and confirm the edited words, section order, and stage directions appear in the desktop workspace and floating teleprompter.
5. Send a second script while one is waiting. Confirm the desktop asks you to review or dismiss the first. Dismiss it and check that the current desktop draft is unchanged.
6. Disconnect from each side, close the desktop app, and try sending with a stale page. Confirm the website reports that the connection expired or was revoked and that a new pairing is required.
7. Repeat on macOS and Windows, and with supported browsers. A passing Node HTTP test is not evidence that browser permission prompts, cross-origin behavior, desktop window movement, or Windows behavior work.

Production desktop builds must be created with `LILTWISE_ALLOWED_WEB_ORIGINS` set to comma-separated exact HTTPS website origins. Do not put a wildcard or path in the list. The current local development setup is configured for the two localhost origins above. The official production domain and browser permission behavior remain to be verified.

### Milestone 4 end-to-end check run

- Website: existing Next.js development server at `http://localhost:3000`; HTTP response was 200. Electron was started with `pnpm dev:desktop`; Vite renderer and companion service started on their configured ports. The desktop workspace and companion status responded.
- Created a temporary script in the website using **Write a script manually**; no AI credentials or fake generation response were used. It contained three ordered sections, Kannada and accented text, and unique marker phrases.
- The website's real **Connect to Desktop** action reached the loopback service and opened pairing. The local browser showed no Local Network Access permission prompt. Entering the code shown by the desktop paired the apps; the website showed **Connected** and the desktop showed **Website paired**.
- The website's **Send to Desktop** action received the service's success response. The desktop displayed the incoming title, three-section count and opening preview. Before approval, the desktop draft still contained its original sample text.
- Accepted the incoming script through the desktop confirmation. The desktop editor showed the title, all three sections in order, and the original Kannada/accented text. Opened the floating teleprompter and verified the same transferred text and marker in its rendered content and screenshot.
- No browser console errors were recorded during the website connection and send. This verifies local development on this Mac with the available in-app browser. It does not verify a deployed HTTPS origin's permission behavior, other browsers, or Windows.
- The pairing code and session token were not included in test output or documentation. The test script is temporary browser-session data and is not included in the repository.

## Checks completed for Milestone 2

- The packaged macOS app workspace and floating teleprompter were visually inspected.
- Script entry, word count, opening the overlay, time-based play/pause, updating the script, hiding, and reopening were exercised on macOS.
- macOS window movement and edge resizing were not confirmed through the available UI automation controls; verify them manually on the development Mac.
- Windows resizing, z-order, transparency, installer behavior, and the Windows manual checks above remain unverified until run on a Windows machine.

## Platform limits

The current development computer is macOS. Windows launch, packaging, installer, update, and overlay behavior require a Windows computer or CI runner and remain unverified until then. The app does not claim that its overlay is hidden from screen sharing or recording; validate behavior with each target meeting and recording application.
