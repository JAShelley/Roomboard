const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const CAPTURE_HOTKEY = process.env.ROOMBOARD_CAPTURE_HOTKEY || "CommandOrControl+Shift+R";
const HELPER_CONFIGS = {
  win32: {
    name: "Windows",
    executable: "RoomBoard.Capture.Helper.exe",
    resourceDir: "capture-helper-windows",
    legacyResourceDir: "capture-helper",
    devCandidates: [
      path.join("capture-helper", "bin", "Release", "net8.0-windows", "win-x64", "publish", "RoomBoard.Capture.Helper.exe"),
      path.join("capture-helper", "bin", "Release", "net8.0-windows", "RoomBoard.Capture.Helper.exe"),
      path.join("capture-helper", "bin", "Debug", "net8.0-windows", "RoomBoard.Capture.Helper.exe")
    ]
  },
  darwin: {
    name: "Mac",
    executable: "RoomBoardCaptureHelper",
    resourceDir: "capture-helper-mac",
    devCandidates: [
      path.join("capture-helper-mac", ".build", "release", "RoomBoardCaptureHelper"),
      path.join("capture-helper-mac", ".build", "debug", "RoomBoardCaptureHelper")
    ]
  }
};

let mainWindow = null;
let overlayWindow = null;
let overlayBounds = null;
let monitorProcess = null;
let monitorBuffer = "";
let lastHoverPayload = null;
let isArmed = false;

function desktopPath(filename) {
  return path.join(__dirname, filename);
}

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function sendStatus(message, detail = {}) {
  const helperInfo = getHelperInfo();
  sendToMain("capture:status", {
    armed: isArmed,
    helperAvailable: !!helperInfo.path,
    helperPlatform: helperInfo.config?.name || process.platform,
    hotkey: CAPTURE_HOTKEY,
    message,
    ...detail
  });
}

function getHelperInfo() {
  const config = HELPER_CONFIGS[process.platform];
  if (!config) return { config: null, path: null };

  const candidates = [];
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, config.resourceDir, config.executable));
    if (config.legacyResourceDir) {
      candidates.push(path.join(process.resourcesPath, config.legacyResourceDir, config.executable));
    }
  }

  config.devCandidates.forEach((candidate) => {
    candidates.push(path.join(__dirname, candidate));
  });

  return {
    config,
    path: candidates.find((candidate) => fs.existsSync(candidate)) || null
  };
}

function getHelperPath() {
  return getHelperInfo().path;
}

function getOverlayBoundsForCursor() {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  return display.bounds;
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== "object") return null;
  const left = Number(bounds.left);
  const top = Number(bounds.top);
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

function convertBoundsToOverlay(bounds) {
  const normalized = normalizeBounds(bounds);
  if (!normalized || !overlayBounds) return null;
  return {
    left: Math.round(normalized.left - overlayBounds.x),
    top: Math.round(normalized.top - overlayBounds.y),
    width: Math.round(normalized.width),
    height: Math.round(normalized.height)
  };
}

async function ensureOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

  overlayBounds = getOverlayBoundsForCursor();
  overlayWindow = new BrowserWindow({
    x: overlayBounds.x,
    y: overlayBounds.y,
    width: overlayBounds.width,
    height: overlayBounds.height,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    focusable: false,
    frame: false,
    fullscreenable: false,
    hasShadow: false,
    movable: false,
    resizable: false,
    show: false,
    skipTaskbar: true,
    transparent: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: desktopPath("capture-preload.cjs"),
      sandbox: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.on("closed", () => {
    overlayWindow = null;
    overlayBounds = null;
  });

  await overlayWindow.loadFile(desktopPath("capture-overlay.html"));
  overlayWindow.showInactive();
  return overlayWindow;
}

function closeOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.close();
  overlayWindow = null;
  overlayBounds = null;
}

function emitHover(payload) {
  lastHoverPayload = payload || null;
  const overlayPayload = {
    ...payload,
    overlayBounds: payload?.bounds ? convertBoundsToOverlay(payload.bounds) : null
  };

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send("capture:hover", overlayPayload);
  }
  sendToMain("capture:hover", payload);
}

function emitCaptured(payload) {
  const captured = payload || lastHoverPayload || {};
  sendToMain("capture:captured", captured);
  stopCapture("Captured appointment text.");
}

function handleHelperLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return;

  let payload = null;
  try {
    payload = JSON.parse(trimmed);
  } catch (error) {
    sendStatus(trimmed);
    return;
  }

  if (payload.type === "hover") {
    emitHover(payload);
    return;
  }

  if (payload.type === "capture") {
    emitCaptured(payload);
    return;
  }

  if (payload.type === "status" || payload.message) {
    sendStatus(payload.message || "Capture helper update.", payload);
  }
}

function handleHelperChunk(chunk) {
  monitorBuffer += String(chunk || "");
  const lines = monitorBuffer.split(/\r?\n/);
  monitorBuffer = lines.pop() || "";
  lines.forEach(handleHelperLine);
}

async function startCapture() {
  if (isArmed) {
    return { ok: true, message: "Capture is already armed." };
  }

  const helperInfo = getHelperInfo();
  if (!helperInfo.config) {
    const message = "Native appointment capture is only available in the Windows and Mac capture apps.";
    sendStatus(message);
    return { ok: false, message };
  }

  const helperPath = helperInfo.path;
  if (!helperPath) {
    const command = process.platform === "darwin" ? "npm run capture:helper:build:mac" : "npm run capture:helper:build";
    const message = `${helperInfo.config.name} capture helper is not built yet. Run ${command}.`;
    sendStatus(message);
    return { ok: false, message };
  }

  await ensureOverlayWindow();
  isArmed = true;
  monitorBuffer = "";
  lastHoverPayload = null;

  monitorProcess = spawn(helperPath, ["monitor"], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  monitorProcess.stdout.setEncoding("utf8");
  monitorProcess.stderr.setEncoding("utf8");
  monitorProcess.stdout.on("data", handleHelperChunk);
  monitorProcess.stderr.on("data", (chunk) => {
    const message = String(chunk || "").trim();
    if (message) sendStatus(message);
  });
  monitorProcess.on("exit", (code) => {
    monitorProcess = null;
    if (isArmed) {
      isArmed = false;
      closeOverlayWindow();
      sendStatus(`Capture helper stopped${code == null ? "." : ` (${code}).`}`);
    }
  });

  sendStatus("Capture armed. Hover an appointment box, then click it.");
  return { ok: true, message: "Capture armed." };
}

function stopCapture(message = "Capture stopped.") {
  isArmed = false;

  if (monitorProcess) {
    try {
      monitorProcess.kill();
    } catch (_error) {}
    monitorProcess = null;
  }

  closeOverlayWindow();
  sendStatus(message);
  return { ok: true, message };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#101820",
    height: 820,
    minHeight: 720,
    minWidth: 440,
    show: false,
    title: "RoomBoard Capture",
    width: 520,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: desktopPath("capture-preload.cjs"),
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) mainWindow.show();
    sendStatus("Ready.");
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadFile(desktopPath("capture-ui.html"));
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  const registered = globalShortcut.register(CAPTURE_HOTKEY, () => {
    if (isArmed) stopCapture("Capture cancelled.");
    else startCapture().catch((error) => sendStatus(String(error?.message || error || "Capture failed.")));
  });

  if (!registered) {
    sendStatus(`Could not register hotkey ${CAPTURE_HOTKEY}.`);
  }
}

ipcMain.handle("capture:start", () => startCapture());
ipcMain.handle("capture:stop", () => stopCapture("Capture cancelled."));
ipcMain.handle("capture:get-status", () => ({
  armed: isArmed,
  helperAvailable: !!getHelperPath(),
  helperPlatform: getHelperInfo().config?.name || process.platform,
  hotkey: CAPTURE_HOTKEY,
  platform: process.platform
}));

app.on("window-all-closed", () => {
  stopCapture("Capture stopped.");
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  stopCapture("Capture stopped.");
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.whenReady().then(() => {
  createMainWindow();
  registerHotkey();
}).catch((error) => {
  console.error("RoomBoard Capture startup failed:", error);
  app.quit();
});
