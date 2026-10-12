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
- `test` runs shared domain tests plus Event Brain validation, upload extraction, rate-limit, and generation-service tests with Node's built-in test runner. Provider calls are mocked; a live OpenAI request requires the local server environment variables and is not part of automated tests.
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

## Checks completed for Milestone 2

- The packaged macOS app workspace and floating teleprompter were visually inspected.
- Script entry, word count, opening the overlay, time-based play/pause, updating the script, hiding, and reopening were exercised on macOS.
- macOS window movement and edge resizing were not confirmed through the available UI automation controls; verify them manually on the development Mac.
- Windows resizing, z-order, transparency, installer behavior, and the Windows manual checks above remain unverified until run on a Windows machine.

## Platform limits

The current development computer is macOS. Windows launch, packaging, installer, update, and overlay behavior require a Windows computer or CI runner and remain unverified until then. The app does not claim that its overlay is hidden from screen sharing or recording; validate behavior with each target meeting and recording application.
