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

## GitHub Actions
This repo now includes two GitHub Actions workflows at the repository root:

- `.github/workflows/windows-build.yml`: builds the Windows installer on `push`, `pull_request`, or manual dispatch and uploads the installer as a workflow artifact.
- `.github/workflows/release-windows.yml`: builds the Windows installer on version tags like `v0.1.0` or manual dispatch, then creates or updates a GitHub Release with the downloadable installer attached.

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
