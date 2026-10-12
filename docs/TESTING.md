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
- `test` runs the shared domain logic tests with Node's built-in test runner.
- `build` creates a production website build and packages the local Electron app for the current macOS architecture. It does not sign or notarize an installer.

## Run locally

Website:

```sh
pnpm dev:site
```

Open <http://localhost:3000>.

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
