# Testing and verification

## Automated checks

From the repository root:

```sh
pnpm lint
pnpm typecheck
pnpm build
```

- `lint` runs ESLint across the site and shared packages.
- `typecheck` runs TypeScript checks for the workspace applications and shared packages.
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

The Electron app should show the Liltwise welcome screen and close when its window is closed.

## Manual checks for this milestone

1. Check the landing page at a wide desktop width and a narrow mobile width. Navigation should reach the matching page sections.
2. Confirm the download section says installers are not available yet; no button should imply that an installer exists.
3. Launch the Electron shell, confirm the welcome screen loads, and close the window. No microphone permission prompt should appear.
4. Confirm the renderer can call only the documented `getAppInfo` preload method. No raw Electron or filesystem API should be exposed to `window`.
5. If packaging for Windows, run the Windows package and smoke checks on a Windows runner. A macOS build is not evidence that the Windows app works.

## Platform limits

The current development computer is macOS. Windows launch, packaging, installer, update, and overlay behavior require a Windows computer or CI runner and remain unverified until then. This milestone does not implement the overlay, so it does not verify window stacking or screen-sharing behavior.
