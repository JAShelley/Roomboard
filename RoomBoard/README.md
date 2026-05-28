# RoomBoard

RoomBoard now serves a split static board application from `public/roomboard` and uses the Next app only as a lightweight redirect shell.

## Structure
- `public/roomboard/index.html`: board markup
- `public/roomboard/styles.css`: board styling
- `public/roomboard/config.js`: runtime Supabase public config
- `public/roomboard/js/compat.js`: shared helpers and compatibility utilities
- `public/roomboard/js/board-state.js`: defaults, state, persistence, and board logic
- `public/roomboard/js/rendering.js`: display and settings rendering
- `public/roomboard/js/settings.js`: settings drawer behavior and section actions
- `public/roomboard/js/auth-sync.js`: Supabase auth, sync, and persistence flows
- `public/roomboard/js/init.js`: board bootstrap
- `public/roomboard/js/ux.js`: back-to-top and small UX helpers
- `public/roomboard/js/theme.js`: theme presets and theme persistence

## Run
```bash
npm run dev
```

Then open:

- [http://localhost:3000](http://localhost:3000)
- [http://localhost:3000/roomboard/index.html](http://localhost:3000/roomboard/index.html)

## Verification
- `public/roomboard/smoke-test-checklist.md`
- `public/roomboard/settings-save-model.md`

## Pulse addon backend
The Pulse browser addon can now use Next.js API routes instead of writing to Supabase tables directly.

Routes:
- `/api/pulse/session/login`
- `/api/pulse/session/refresh`
- `/api/pulse/board`
- `/api/pulse/send`

Required server env:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Deploy the Next app to a real server platform such as Vercel, then enter that deployed base URL inside the Pulse addon login panel, for example:

```text
https://your-roomboard-app.vercel.app
```

## Desktop app build
RoomBoard can be packaged as a desktop app with Electron. The desktop wrapper serves `public/roomboard` over a tiny built-in local server so Supabase auth still runs on `http://127.0.0.1` instead of failing on `file://`. On Mac, appointment capture runs from RoomBoard's menu bar integration instead of a separate visible capture window.

Commands:

```bash
npm install
npm run desktop:assets
npm run desktop:dev
```

To create a Windows installer from a Windows machine:

```bash
npm run desktop:dist:win
```

To create a signed and notarized Mac installer from a Mac with Apple Developer ID credentials:

```bash
npm run desktop:dist:mac:release
```

The packaged app output is written to `dist/` with stable installer filenames:

```text
RoomBoard-Setup-Windows-x64.exe
RoomBoard-macOS.dmg
```

That gives you stable direct-download URL patterns:

```text
https://github.com/jacksonshelley0204-spec/Roomboard/releases/download/v0.1.0/RoomBoard-Setup-Windows-x64.exe
https://github.com/jacksonshelley0204-spec/Roomboard/releases/download/v0.1.0/RoomBoard-macOS.dmg
```

The website download cards use `window.__ROOMBOARD_WINDOWS_DOWNLOAD_URL__` and `window.__ROOMBOARD_MAC_DOWNLOAD_URL__` from `public/roomboard/config.js`. Update `window.__ROOMBOARD_RELEASE_TAG__` there when publishing a new app release tag.

## Capture app downloads
The website still has a separate download slot for RoomBoard Capture on Windows. The old Mac capture download URL now defaults to blank because the Mac capture tool is meant to live inside the normal RoomBoard app menu bar.

Use stable installer filenames:

```text
RoomBoard-Capture-Setup-Windows-x64.exe
```

After the Windows capture installer is built and attached to a release, set these values in `public/roomboard/config.js`:

```js
window.__ROOMBOARD_CAPTURE_WINDOWS_DOWNLOAD_URL__ = "./downloads/RoomBoard-Capture-Setup-Windows-x64.exe";
window.__ROOMBOARD_CAPTURE_WINDOWS_DOWNLOAD_FILENAME__ = "RoomBoard-Capture-Setup-Windows-x64.exe";
```

Each download card checks its same-site download path before showing, so buttons stay hidden until the installer file exists. If you host installers on GitHub Releases instead, replace the relative URL with the full GitHub release asset URL.

## Capture internals and legacy standalone builds
RoomBoard Capture still has a separate Electron entry point for compatibility and testing, but the public Mac distribution should use the normal RoomBoard app with menu bar capture built in.

Source:
- `desktop/capture-main.cjs`: Electron main process, global hotkey, overlay, and helper process bridge
- `desktop/capture-ui.html`: login, capture, review, and send UI
- `desktop/capture-helper`: Windows UI Automation and visual-block helper used to inspect the scheduler element under the cursor
- `desktop/capture-helper-mac`: Mac Accessibility helper used to inspect the scheduler element under the cursor
- `electron-builder.capture.json`: Windows installer config
- `electron-builder.capture.mac.json`: Mac installer config

The first capture layer tries Windows UI Automation for readable appointment text. If the scheduler behaves like a legacy colored appointment grid, the helper falls back to visual block detection around the cursor, highlights the colored appointment rectangle, and sends a cropped appointment preview to the review panel so missing fields can be filled before sending. OCR is the next layer for fully automatic parsing when the scheduler exposes only a flat image.

The Mac helper starts with macOS Accessibility capture. Mac users must allow RoomBoard in System Settings > Privacy & Security > Accessibility. Screen Recording and OCR can be added as the next Mac layer for apps that expose only a flat image.

Development command:

```bash
npm run capture:dev
```

Windows installer command, run from a Windows machine with .NET 8 SDK installed:

```bash
npm run capture:dist:win
```

The helper is published as a self-contained Windows executable and included in the installer resources. The packaged output is written to:

```text
dist-capture/RoomBoard-Capture-Setup-Windows-x64.exe
```

For the static website download button, copy that file to:

```text
public/roomboard/downloads/RoomBoard-Capture-Setup-Windows-x64.exe
```

Legacy standalone Mac capture installer command, run from a Mac:

```bash
npm run capture:dist:mac
```

The packaged output is written to:

```text
dist-capture-mac/RoomBoard-Capture-macOS.dmg
```

Do not use this as the public Mac website download. Use `RoomBoard-macOS.dmg` from the normal desktop app release instead.

## GitHub Actions
This repo includes these GitHub Actions workflows at the repository root:

- `.github/workflows/windows-build.yml`: builds the Windows installer on `push`, `pull_request`, or manual dispatch and uploads the installer as a workflow artifact.
- `.github/workflows/release-windows.yml`: builds the Windows installer on version tags like `v0.1.0` or manual dispatch, then creates or updates a GitHub Release with the downloadable installer attached.
- `.github/workflows/release-mac.yml`: builds the signed and notarized Mac RoomBoard app on version tags like `v0.1.0` or manual dispatch, then attaches `RoomBoard-macOS.dmg` to the same GitHub Release.
- `.github/workflows/capture-windows-build.yml`: builds the RoomBoard Capture Windows installer on `push`, `pull_request`, or manual dispatch and uploads the installer as a workflow artifact.
- `.github/workflows/release-capture-windows.yml`: builds the RoomBoard Capture Windows installer on capture tags like `capture-v0.1.0` or manual dispatch, then creates or updates a GitHub Release with the downloadable installer attached.
- `.github/workflows/capture-mac-build.yml`: builds the legacy standalone RoomBoard Capture Mac installer on `push`, `pull_request`, or manual dispatch and uploads the installer as a workflow artifact.
- `.github/workflows/release-capture-mac.yml`: builds the legacy standalone RoomBoard Capture Mac installer on capture Mac tags like `capture-mac-v0.1.0` or manual dispatch, then creates or updates a GitHub Release with the downloadable installer attached.

The workflows currently assume the app lives in the `RoomBoard/` subfolder of the repository, which matches the current repo layout.

### Publish a download release
1. Push this repository to GitHub and make sure GitHub Actions is enabled.
2. Create and push a version tag such as `v0.1.0`.
3. Wait for the `Release Windows Installer` and `Release Mac RoomBoard App` workflows to finish.
4. Download the `.exe` and `.dmg` installers from the GitHub Release page.

Manual release option:

1. Open the `Release Windows Installer` or `Release Mac RoomBoard App` workflow in GitHub Actions.
2. Run it manually with a tag like `v0.1.0`.
3. The workflow will build the installer and create or update that GitHub Release.

Mac release signing requires these GitHub repository secrets:

```text
MAC_CSC_LINK
MAC_CSC_KEY_PASSWORD
APPLE_TEAM_ID
APPLE_API_KEY_P8
APPLE_API_KEY_ID
APPLE_API_ISSUER
```

You can use `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` instead of the App Store Connect API key secrets. The Mac workflow verifies Developer ID signing, notarization, stapling, and Gatekeeper assessment before uploading the DMG.

After the release finishes, the website Mac button points to:

```text
https://github.com/jacksonshelley0204-spec/Roomboard/releases/download/v0.1.0/RoomBoard-macOS.dmg
```

### Publish a Windows capture app download release
1. Push this repository to GitHub and make sure GitHub Actions is enabled.
2. Create and push a capture version tag such as `capture-v0.1.0`, or run the `Release Capture Windows Installer` workflow manually.
3. Wait for the workflow to finish.
4. Use the stable download URL in `public/roomboard/config.js`:

```text
https://github.com/OWNER/REPO/releases/download/capture-v0.1.0/RoomBoard-Capture-Setup-Windows-x64.exe
```

The legacy standalone Mac capture release should stay off the public website unless there is a short-term support reason to distribute it.
