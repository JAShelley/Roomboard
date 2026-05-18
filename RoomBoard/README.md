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

## Windows app build
RoomBoard can be packaged as a Windows desktop app with Electron. The desktop wrapper serves `public/roomboard` over a tiny built-in local server so Supabase auth still runs on `http://127.0.0.1` instead of failing on `file://`.

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

The packaged app output will be written to `dist/` with a stable installer filename:

```text
RoomBoard-Setup-Windows-x64.exe
```

That gives you a stable direct-download URL pattern:

```text
https://github.com/OWNER/REPO/releases/latest/download/RoomBoard-Setup-Windows-x64.exe
```

To show that button inside the website, set `window.__ROOMBOARD_WINDOWS_DOWNLOAD_URL__` in `public/roomboard/config.js` to your final GitHub release URL.

## Capture app downloads
The website has separate download slots for RoomBoard Capture on Windows and Mac. These are independent from the normal RoomBoard website sync flow; they only appear when installer URLs are set in `public/roomboard/config.js`.

Use stable installer filenames:

```text
RoomBoard-Capture-Setup-Windows-x64.exe
RoomBoard-Capture-macOS.dmg
```

After the capture installers are built and attached to releases, set these values in `public/roomboard/config.js`:

```js
window.__ROOMBOARD_CAPTURE_WINDOWS_DOWNLOAD_URL__ = "./downloads/RoomBoard-Capture-Setup-Windows-x64.exe";
window.__ROOMBOARD_CAPTURE_WINDOWS_DOWNLOAD_FILENAME__ = "RoomBoard-Capture-Setup-Windows-x64.exe";
window.__ROOMBOARD_CAPTURE_MAC_DOWNLOAD_URL__ = "./downloads/RoomBoard-Capture-macOS.dmg";
window.__ROOMBOARD_CAPTURE_MAC_DOWNLOAD_FILENAME__ = "RoomBoard-Capture-macOS.dmg";
```

Each capture download card checks its same-site download path before showing, so buttons stay hidden until the installer file exists. If you host installers on GitHub Releases instead, replace the relative URL with the full GitHub release asset URL.

## Capture app build
RoomBoard Capture is a separate Electron entry point from the normal RoomBoard desktop app.

Source:
- `desktop/capture-main.cjs`: Electron main process, global hotkey, overlay, and helper process bridge
- `desktop/capture-ui.html`: login, capture, review, and send UI
- `desktop/capture-helper`: Windows UI Automation and visual-block helper used to inspect the scheduler element under the cursor
- `desktop/capture-helper-mac`: Mac Accessibility helper used to inspect the scheduler element under the cursor
- `electron-builder.capture.json`: Windows installer config
- `electron-builder.capture.mac.json`: Mac installer config

The first capture layer tries Windows UI Automation for readable appointment text. If the scheduler behaves like a legacy colored appointment grid, the helper falls back to visual block detection around the cursor, highlights the colored appointment rectangle, and sends a cropped appointment preview to the review panel so missing fields can be filled before sending. OCR is the next layer for fully automatic parsing when the scheduler exposes only a flat image.

The Mac helper starts with macOS Accessibility capture. Mac users must allow RoomBoard Capture in System Settings > Privacy & Security > Accessibility. Screen Recording and OCR can be added as the next Mac layer for apps that expose only a flat image.

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

Mac installer command, run from a Mac:

```bash
npm run capture:dist:mac
```

The packaged output is written to:

```text
dist-capture-mac/RoomBoard-Capture-macOS.dmg
```

For the static website download button, copy that file to:

```text
public/roomboard/downloads/RoomBoard-Capture-macOS.dmg
```

## GitHub Actions
This repo now includes two GitHub Actions workflows at the repository root:

- `.github/workflows/windows-build.yml`: builds the Windows installer on `push`, `pull_request`, or manual dispatch and uploads the installer as a workflow artifact.
- `.github/workflows/release-windows.yml`: builds the Windows installer on version tags like `v0.1.0` or manual dispatch, then creates or updates a GitHub Release with the downloadable installer attached.
- `.github/workflows/capture-windows-build.yml`: builds the RoomBoard Capture Windows installer on `push`, `pull_request`, or manual dispatch and uploads the installer as a workflow artifact.
- `.github/workflows/release-capture-windows.yml`: builds the RoomBoard Capture Windows installer on capture tags like `capture-v0.1.0` or manual dispatch, then creates or updates a GitHub Release with the downloadable installer attached.
- `.github/workflows/capture-mac-build.yml`: builds the RoomBoard Capture Mac installer on `push`, `pull_request`, or manual dispatch and uploads the installer as a workflow artifact.
- `.github/workflows/release-capture-mac.yml`: builds the RoomBoard Capture Mac installer on capture Mac tags like `capture-mac-v0.1.0` or manual dispatch, then creates or updates a GitHub Release with the downloadable installer attached.

The workflows currently assume the app lives in the `RoomBoard/` subfolder of the repository, which matches the current repo layout.

### Publish a download release
1. Push this repository to GitHub and make sure GitHub Actions is enabled.
2. Create and push a version tag such as `v0.1.0`.
3. Wait for the `Release Windows Installer` workflow to finish.
4. Download the installer from the GitHub Release page.

Manual release option:

1. Open the `Release Windows Installer` workflow in GitHub Actions.
2. Run it manually with a tag like `v0.1.0`.
3. The workflow will build the installer and create or update that GitHub Release.

### Publish a Windows capture app download release
1. Push this repository to GitHub and make sure GitHub Actions is enabled.
2. Create and push a capture version tag such as `capture-v0.1.0`, or run the `Release Capture Windows Installer` workflow manually.
3. Wait for the workflow to finish.
4. Use the stable download URL in `public/roomboard/config.js`:

```text
https://github.com/OWNER/REPO/releases/download/capture-v0.1.0/RoomBoard-Capture-Setup-Windows-x64.exe
```

### Publish a Mac capture app download release
1. Push this repository to GitHub and make sure GitHub Actions is enabled.
2. Create and push a capture Mac version tag such as `capture-mac-v0.1.0`, or run the `Release Capture Mac Installer` workflow manually.
3. Wait for the workflow to finish.
4. Use the stable download URL in `public/roomboard/config.js`:

```text
https://github.com/OWNER/REPO/releases/download/capture-mac-v0.1.0/RoomBoard-Capture-macOS.dmg
```
