const { app, BrowserWindow, Menu, Tray, clipboard, globalShortcut, ipcMain, nativeImage, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const IS_MAC = process.platform === "darwin";
const IS_WINDOWS = process.platform === "win32";
const DEFAULT_CAPTURE_HOTKEY = process.env.ROOMBOARD_CAPTURE_HOTKEY || "CommandOrControl+Shift+R";
const TRANSPARENT_TRAY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ax5Y9kAAAAASUVORK5CYII=";
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

function createCaptureService(options = {}) {
  const captureHotkey = options.captureHotkey || DEFAULT_CAPTURE_HOTKEY;
  const enableHotkey = options.enableHotkey === true;
  const desktopPath = typeof options.desktopPath === "function"
    ? options.desktopPath
    : (filename) => path.join(__dirname, filename);
  const getTargetWindow = typeof options.getTargetWindow === "function"
    ? options.getTargetWindow
    : () => null;
  const openTargetWindow = typeof options.openTargetWindow === "function"
    ? options.openTargetWindow
    : () => {};
  const quitApp = typeof options.quitApp === "function"
    ? options.quitApp
    : () => app.quit();
  const trayToolTip = options.trayToolTip || "RoomBoard Capture";
  const openLabel = options.openLabel || "Open Login / Review";
  const captureLabel = options.captureLabel || "Capture Selected Appointment";
  const quitLabel = options.quitLabel || "Quit RoomBoard Capture";
  const macTrayIdleTitle = options.macTrayIdleTitle || "RoomBoard";
  const macTrayActiveTitle = options.macTrayActiveTitle || "RoomBoard ON";
  const openReviewOnCapture = options.openReviewOnCapture === true
    || process.env.ROOMBOARD_CAPTURE_OPEN_ON_CAPTURE === "1";
  const useReviewWindow = options.useReviewWindow === true;
  const reviewWindowOptions = options.reviewWindowOptions || {};
  const quickSendWindowOptions = options.quickSendWindowOptions || {};
  const trayClickAction = options.trayClickAction || "capture";
  const menuBarOnlyCaptureMessage = "Use the RoomBoard menu bar button to arm capture.";
  const captureTimeoutMs = Math.max(5000, Number(options.captureTimeoutMs || 30000));

  let overlayWindow = null;
  let overlayBounds = null;
  let monitorProcess = null;
  let monitorBuffer = "";
  let lastHoverPayload = null;
  let isArmed = false;
  let tray = null;
  let lastTrayRightClickAt = 0;
  let lastCapturedPayload = null;
  let captureTimeoutTimer = null;
  let reviewWindow = null;
  let reviewWindowShouldOpenWhenReady = false;
  let pendingReviewStatusMessage = null;
  let quickSendWindow = null;
  let quickSendRequestSeq = 0;
  const pendingQuickSendRequests = new Map();
  let ipcRegistered = false;

  function getReviewTargetWindow() {
    return useReviewWindow ? reviewWindow : getTargetWindow();
  }

  function sendToTarget(channel, payload) {
    const targetWindow = getReviewTargetWindow();
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.webContents.send(channel, payload);
    }
  }

  function sendToQuickSend(channel, payload) {
    if (quickSendWindow && !quickSendWindow.isDestroyed()) {
      quickSendWindow.webContents.send(channel, payload);
    }
  }

  function sendStatus(message, detail = {}) {
    const helperInfo = getHelperInfo();
    const payload = {
      armed: isArmed,
      helperAvailable: !!helperInfo.path,
      helperPlatform: helperInfo.config?.name || process.platform,
      hotkey: enableHotkey ? captureHotkey : "",
      message,
      ...detail
    };
    sendToTarget("capture:status", payload);
    sendToQuickSend("capture:status", payload);
    updateTray();
  }

  function shouldOpenReview(payload) {
    if (openReviewOnCapture) return true;
    if (!payload) return false;
    if (payload.requiresReview) return true;
    if (payload.imageDataUrl && !normalizeCapturedText(payload.text || payload.name)) return true;
    return false;
  }

  function getTrayIcon() {
    const candidates = [];
    if (app.isPackaged) {
      candidates.push(path.join(process.resourcesPath, "tray-icon.png"));
      candidates.push(path.join(process.resourcesPath, "icon.png"));
    }

    candidates.push(path.join(__dirname, "..", "build", "icon.png"));
    candidates.push(path.join(__dirname, "..", "build", "icon.ico"));

    const iconPath = candidates.find((candidate) => fs.existsSync(candidate));
    let image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createFromDataURL(TRANSPARENT_TRAY_ICON);
    if (!image.isEmpty()) {
      image = image.resize({ width: IS_MAC ? 18 : 16, height: IS_MAC ? 18 : 16 });
      if (IS_MAC) image.setTemplateImage(true);
    }
    return image;
  }

  function createTray() {
    if (tray) return tray;

    tray = new Tray(getTrayIcon());
    tray.setToolTip(trayToolTip);
    if (IS_MAC) {
      tray.setTitle(macTrayIdleTitle);
      tray.setIgnoreDoubleClickEvents(true);
      tray.on("click", () => {
        if (Date.now() - lastTrayRightClickAt < 350) return;
        handleTrayPrimaryClick();
      });
    } else {
      tray.on("click", () => {
        handleTrayPrimaryClick();
      });
    }
    tray.on("right-click", () => {
      lastTrayRightClickAt = Date.now();
      if (isArmed) {
        stopCapture("Capture cancelled.");
        return;
      }
      tray.popUpContextMenu(buildTrayMenu());
    });
    updateTray();
    return tray;
  }

  function buildTrayMenu() {
    const menuItems = [
      {
        label: openLabel,
        click: () => openReviewSurface(isArmed ? "Capture active." : "Ready.")
      },
      {
        label: isArmed ? "Cancel Capture" : captureLabel,
        click: () => toggleCaptureFromTray()
      }
    ];

    if (lastCapturedPayload) {
      menuItems.push({
        label: "Review Last Capture",
        click: () => {
          openQuickSendSurface("Review captured appointment.");
          sendCapturedToTarget(lastCapturedPayload);
        }
      });
    }

    menuItems.push(
      { type: "separator" },
      {
        label: quitLabel,
        click: () => quitApp()
      }
    );

    return Menu.buildFromTemplate(menuItems);
  }

  function handleTrayPrimaryClick() {
    if (trayClickAction === "quick-send") {
      openQuickSendSurface(isArmed ? "Capture active." : "Ready.");
      return;
    }
    toggleCaptureFromTray();
  }

  function updateTray() {
    if (!tray) return;
    const helperInfo = getHelperInfo();
    const status = isArmed ? "active" : "idle";
    const helper = helperInfo.path ? "helper ready" : "helper unavailable";
    tray.setToolTip(`${trayToolTip}: ${status}, ${helper}`);
    if (IS_MAC) {
      tray.setTitle(isArmed ? macTrayActiveTitle : macTrayIdleTitle);
    }
  }

  function scheduleCaptureTimeout() {
    clearCaptureTimeout();
    captureTimeoutTimer = setTimeout(() => {
      if (isArmed) {
        stopCapture("Capture timed out.");
      }
    }, captureTimeoutMs);
  }

  function clearCaptureTimeout() {
    if (!captureTimeoutTimer) return;
    clearTimeout(captureTimeoutTimer);
    captureTimeoutTimer = null;
  }

  function openReviewSurface(statusMessage) {
    if (useReviewWindow) {
      showReviewWindow(statusMessage);
      return;
    }
    openTargetWindow(statusMessage);
    sendStatus(statusMessage || (isArmed ? "Capture active." : "Ready."));
  }

  function showReviewWindow(statusMessage) {
    if (!reviewWindow || reviewWindow.isDestroyed()) {
      reviewWindowShouldOpenWhenReady = true;
      pendingReviewStatusMessage = statusMessage || null;
      createReviewWindow({ showOnReady: true });
      return;
    }

    if (reviewWindow.isMinimized()) reviewWindow.restore();
    reviewWindow.setSkipTaskbar(IS_WINDOWS);
    reviewWindow.show();
    reviewWindow.focus();
    if (IS_MAC && typeof app.focus === "function") {
      app.focus({ steal: true });
    }
    sendStatus(statusMessage || (isArmed ? "Capture active." : "Ready."));
  }

  function hideReviewWindow() {
    if (!reviewWindow || reviewWindow.isDestroyed()) return;
    reviewWindow.hide();
    reviewWindow.setSkipTaskbar(true);
  }

  function openQuickSendSurface(statusMessage) {
    showQuickSendWindow(statusMessage);
  }

  function showQuickSendWindow(statusMessage) {
    if (!quickSendWindow || quickSendWindow.isDestroyed()) {
      createQuickSendWindow({ showOnReady: true, statusMessage });
      return;
    }

    positionQuickSendWindow();
    if (quickSendWindow.isMinimized()) quickSendWindow.restore();
    quickSendWindow.setSkipTaskbar(true);
    quickSendWindow.show();
    quickSendWindow.focus();
    if (IS_MAC && typeof app.focus === "function") {
      app.focus({ steal: true });
    }
    sendStatus(statusMessage || (isArmed ? "Capture active." : "Ready."));
    refreshQuickSendSnapshot().catch(() => {});
  }

  function hideQuickSendWindow() {
    if (!quickSendWindow || quickSendWindow.isDestroyed()) return;
    quickSendWindow.hide();
    quickSendWindow.setSkipTaskbar(true);
  }

  function isQuickSendWindowVisible() {
    return !!(quickSendWindow && !quickSendWindow.isDestroyed() && quickSendWindow.isVisible());
  }

  function positionQuickSendWindow() {
    if (!quickSendWindow || quickSendWindow.isDestroyed()) return;

    const bounds = quickSendWindow.getBounds();
    const trayBounds = tray && typeof tray.getBounds === "function" ? tray.getBounds() : null;
    const anchorPoint = trayBounds
      ? { x: trayBounds.x + Math.round(trayBounds.width / 2), y: trayBounds.y + Math.round(trayBounds.height / 2) }
      : screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(anchorPoint);
    const area = display.workArea || display.bounds;
    const margin = 8;
    const targetX = trayBounds
      ? trayBounds.x + Math.round(trayBounds.width / 2) - Math.round(bounds.width / 2)
      : anchorPoint.x - Math.round(bounds.width / 2);
    const isMenuBarAnchor = trayBounds && trayBounds.y <= area.y + 40;
    const targetY = isMenuBarAnchor
      ? trayBounds.y + trayBounds.height + margin
      : anchorPoint.y + margin;

    const x = Math.max(area.x + margin, Math.min(targetX, area.x + area.width - bounds.width - margin));
    const y = Math.max(area.y + margin, Math.min(targetY, area.y + area.height - bounds.height - margin));
    quickSendWindow.setBounds({ x, y, width: bounds.width, height: bounds.height });
  }

  function toggleCaptureFromTray() {
    if (isArmed) {
      stopCapture("Capture cancelled.");
      return;
    }

    startHoverCapture({ source: "menu-bar" }).then((result) => {
      if (result && result.ok === false) {
        sendStatus(result.message || "Capture could not start.");
      }
    }).catch((error) => {
      sendStatus(String(error?.message || error || "Capture failed."));
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
    const hoverBounds = chooseHoverBounds(payload);
    const overlayPayload = {
      ...payload,
      overlayBounds: hoverBounds ? convertBoundsToOverlay(hoverBounds) : null
    };

    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send("capture:hover", overlayPayload);
    }
    sendToTarget("capture:hover", payload);
  }

  function chooseHoverBounds(payload) {
    const visualBounds = normalizeBounds(payload?.visualBounds);
    if (isLikelyAppointmentBounds(visualBounds)) return visualBounds;

    const bounds = normalizeBounds(payload?.bounds);
    if (isLikelyAppointmentBounds(bounds)) return bounds;
    return null;
  }

  function isLikelyAppointmentBounds(bounds) {
    if (!bounds) return false;
    if (bounds.width < 32 || bounds.height < 20) return false;
    if (bounds.width > 820 || bounds.height > 560) return false;
    return true;
  }

  function sendCapturedToTarget(captured) {
    const appCaptured = {
      ...captured,
      quickSendPopoutOpen: isQuickSendWindowVisible()
    };
    sendToTarget("capture:captured", appCaptured);
    sendToQuickSend("capture:captured", captured);
    setTimeout(() => sendToTarget("capture:captured", appCaptured), 150);
    setTimeout(() => sendToQuickSend("capture:captured", captured), 150);
  }

  function emitCaptured(payload) {
    const captured = payload || lastHoverPayload || {};
    lastCapturedPayload = captured;
    stopCapture(captured.text || captured.name ? "Captured appointment text." : "Captured appointment preview.");
    if (shouldOpenReview(captured)) {
      openQuickSendSurface("Review captured appointment.");
    }
    sendCapturedToTarget(captured);
  }

  function handleHelperLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) return;

    let payload = null;
    try {
      payload = JSON.parse(trimmed);
    } catch (_error) {
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

    if (payload.type === "cancel") {
      stopCapture(payload.message || "Capture cancelled.");
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

  function normalizeCapturedText(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  function looksLikeAppointmentText(value) {
    const text = normalizeCapturedText(value);
    if (text.length < 4) return false;
    if (/^\W*\([A-Z?]\s*,?\s*\d{0,3}\)/i.test(text)) return true;
    if (/\b(?:pro|bwx?|exam|pexam|tx|srp|oh|fmxl?|pfm|comp|dvm|doctor|dr\.?)\b/i.test(text)) return true;
    if (/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(text)) return true;
    return text.split(/\n/).filter(Boolean).length >= 2 && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(text);
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function runHelperCommand(args, commandOptions = {}) {
    const helperInfo = getHelperInfo();
    const helperPath = helperInfo.path;
    if (!helperInfo.config) {
      return Promise.reject(new Error("Native appointment capture is only available in the Windows and Mac capture apps."));
    }
    if (!helperPath) {
      const command = IS_MAC ? "npm run capture:helper:build:mac" : "npm run capture:helper:build";
      return Promise.reject(new Error(`${helperInfo.config.name} capture helper is not built yet. Run ${command}.`));
    }

    return new Promise((resolve, reject) => {
      const events = [];
      let stdoutBuffer = "";
      let stderr = "";
      let settled = false;
      const timeoutMs = Number(commandOptions.timeoutMs || 2500);

      const child = spawn(helperPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });

      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(events);
      };

      const parseLine = (line) => {
        const trimmed = String(line || "").trim();
        if (!trimmed) return;
        try {
          const payload = JSON.parse(trimmed);
          events.push(payload);
          if (payload.type === "status" || payload.message) {
            sendStatus(payload.message || "Capture helper update.", payload);
          }
        } catch (_error) {
          events.push({ type: "status", message: trimmed });
          sendStatus(trimmed);
        }
      };

      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch (_error) {}
        finish(new Error("Capture helper timed out."));
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdoutBuffer += String(chunk || "");
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || "";
        lines.forEach(parseLine);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk || "");
      });
      child.on("error", finish);
      child.on("close", (code) => {
        parseLine(stdoutBuffer);
        if (code && events.length === 0) {
          finish(new Error(stderr.trim() || `Capture helper exited with code ${code}.`));
          return;
        }
        finish();
      });
    });
  }

  async function copySelectedTextFromActiveApp() {
    const before = clipboard.readText() || "";
    await runHelperCommand(["copy-selection"], { timeoutMs: 1500 }).catch((error) => {
      sendStatus(String(error?.message || error || "Could not send copy shortcut."));
    });
    await delay(IS_MAC ? 260 : 180);

    const after = clipboard.readText() || "";
    const copiedText = normalizeCapturedText(after);
    if (!copiedText) return "";
    if (after !== before) return copiedText;
    return looksLikeAppointmentText(copiedText) ? copiedText : "";
  }

  async function inspectCursorOnce() {
    const events = await runHelperCommand(["inspect"], { timeoutMs: 3000 });
    return events.reverse().find((payload) => (
      payload
      && (payload.type === "capture" || payload.text || payload.name || payload.imageDataUrl)
      && (normalizeCapturedText(payload.text || payload.name) || payload.imageDataUrl)
    )) || null;
  }

  function rejectNonMenuBarCapture(options) {
    if (options?.source === "menu-bar") return null;
    return { ok: false, message: menuBarOnlyCaptureMessage };
  }

  async function startCapture(options = {}) {
    const rejected = rejectNonMenuBarCapture(options);
    if (rejected) return rejected;

    if (isArmed) {
      return { ok: true, message: "Capture is already running." };
    }

    const helperInfo = getHelperInfo();
    if (!helperInfo.config) {
      const message = "Native appointment capture is only available in the Windows and Mac capture apps.";
      sendStatus(message);
      return { ok: false, message };
    }

    if (!helperInfo.path) {
      const command = IS_MAC ? "npm run capture:helper:build:mac" : "npm run capture:helper:build";
      const message = `${helperInfo.config.name} capture helper is not built yet. Run ${command}.`;
      sendStatus(message);
      return { ok: false, message };
    }

    isArmed = true;
    updateTray();
    sendStatus("Capturing selected appointment. If nothing is selected, the app will use a screen preview.");
    scheduleCaptureTimeout();

    try {
      const copiedText = await copySelectedTextFromActiveApp();
      if (copiedText) {
        emitCaptured({
          type: "capture",
          text: copiedText,
          name: "",
          captureMethod: "selected-text",
          windowTitle: "Selected text",
          processName: "",
          bounds: null,
          visualBounds: null,
          imageDataUrl: null
        });
        return { ok: true, message: "Captured selected appointment text." };
      }

      const inspected = await inspectCursorOnce();
      if (inspected) {
        emitCaptured({
          ...inspected,
          type: "capture",
          captureMethod: inspected.captureMethod || "cursor-inspect"
        });
        return { ok: true, message: inspected.text || inspected.name ? "Captured appointment details." : "Captured screen preview." };
      }

      const message = "No appointment text or screen preview was captured. Copy the appointment text, then use the capture button again.";
      isArmed = false;
      clearCaptureTimeout();
      updateTray();
      sendStatus(message);
      return { ok: false, message };
    } catch (error) {
      const message = String(error?.message || error || "Capture failed.");
      isArmed = false;
      clearCaptureTimeout();
      updateTray();
      sendStatus(message);
      return { ok: false, message };
    }
  }

  async function startHoverCapture(options = {}) {
    const rejected = rejectNonMenuBarCapture(options);
    if (rejected) return rejected;

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
      const command = IS_MAC ? "npm run capture:helper:build:mac" : "npm run capture:helper:build";
      const message = `${helperInfo.config.name} capture helper is not built yet. Run ${command}.`;
      sendStatus(message);
      return { ok: false, message };
    }

    await ensureOverlayWindow();
    isArmed = true;
    scheduleCaptureTimeout();
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
        clearCaptureTimeout();
        closeOverlayWindow();
        updateTray();
        sendStatus(`Capture helper stopped${code == null ? "." : ` (${code}).`}`);
      }
    });

    sendStatus(`Capture armed. Hover an appointment box, then click it. Right-click cancels. Auto-cancels in ${Math.round(captureTimeoutMs / 1000)}s.`);
    return { ok: true, message: "Capture armed." };
  }

  function stopCapture(message = "Capture stopped.") {
    isArmed = false;
    clearCaptureTimeout();

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

  function createReviewWindow(windowOptions = {}) {
    const showOnReady = windowOptions.showOnReady === true || reviewWindowShouldOpenWhenReady;
    reviewWindow = new BrowserWindow({
      autoHideMenuBar: true,
      backgroundColor: "#e9eef3",
      height: reviewWindowOptions.height || 820,
      minHeight: reviewWindowOptions.minHeight || 720,
      minWidth: reviewWindowOptions.minWidth || 440,
      show: false,
      skipTaskbar: IS_WINDOWS || !showOnReady,
      title: reviewWindowOptions.title || "RoomBoard Capture",
      width: reviewWindowOptions.width || 520,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: desktopPath("capture-preload.cjs"),
        sandbox: false
      }
    });

    reviewWindow.once("ready-to-show", () => {
      const readyMessage = pendingReviewStatusMessage || "Ready.";
      pendingReviewStatusMessage = null;
      if (showOnReady) {
        reviewWindowShouldOpenWhenReady = false;
        if (IS_WINDOWS) reviewWindow.setSkipTaskbar(true);
        if (reviewWindow) reviewWindow.show();
        if (IS_MAC && typeof app.focus === "function") {
          app.focus({ steal: true });
        }
      } else {
        hideReviewWindow();
      }
      sendStatus(readyMessage);
    });

    reviewWindow.on("close", (event) => {
      if (options.isQuitting && options.isQuitting()) return;
      event.preventDefault();
      hideReviewWindow();
    });

    reviewWindow.on("closed", () => {
      reviewWindow = null;
    });

    reviewWindow.loadFile(desktopPath("capture-ui.html"));
  }

  function createQuickSendWindow(windowOptions = {}) {
    const showOnReady = windowOptions.showOnReady === true;
    quickSendWindow = new BrowserWindow({
      autoHideMenuBar: true,
      backgroundColor: "#f8fafc",
      frame: true,
      height: quickSendWindowOptions.height || 700,
      minHeight: quickSendWindowOptions.minHeight || 560,
      minWidth: quickSendWindowOptions.minWidth || 380,
      resizable: true,
      show: false,
      skipTaskbar: true,
      title: quickSendWindowOptions.title || "RoomBoard Quick Send",
      width: quickSendWindowOptions.width || 430,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: desktopPath("capture-preload.cjs"),
        sandbox: false
      }
    });

    quickSendWindow.once("ready-to-show", () => {
      if (!quickSendWindow || quickSendWindow.isDestroyed()) return;
      positionQuickSendWindow();
      if (showOnReady) {
        quickSendWindow.show();
        quickSendWindow.focus();
        if (IS_MAC && typeof app.focus === "function") {
          app.focus({ steal: true });
        }
      } else {
        hideQuickSendWindow();
      }
      sendStatus(windowOptions.statusMessage || (isArmed ? "Capture active." : "Ready."));
      refreshQuickSendSnapshot().catch(() => {});
    });

    quickSendWindow.on("close", (event) => {
      if (options.isQuitting && options.isQuitting()) return;
      event.preventDefault();
      hideQuickSendWindow();
    });

    quickSendWindow.on("closed", () => {
      quickSendWindow = null;
    });

    quickSendWindow.loadFile(desktopPath("capture-popout.html"));
  }

  async function requestQuickSendHost(action, payload = {}) {
    let targetWindow = getTargetWindow();
    if (!targetWindow || targetWindow.isDestroyed()) {
      await Promise.resolve(openTargetWindow("Ready."));
      await delay(300);
      targetWindow = getTargetWindow();
    }

    if (!targetWindow || targetWindow.isDestroyed()) {
      throw new Error("Open RoomBoard before using Quick Send.");
    }

    const requestId = `quick-send-${Date.now()}-${++quickSendRequestSeq}`;
    const request = { requestId, action, payload };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingQuickSendRequests.delete(requestId);
        reject(new Error("RoomBoard Quick Send is not ready yet."));
      }, 5000);
      pendingQuickSendRequests.set(requestId, { resolve, reject, timeout });
      targetWindow.webContents.send("capture:quick-send-request", request);
    });
  }

  async function refreshQuickSendSnapshot() {
    try {
      const response = await requestQuickSendHost("snapshot", {});
      const snapshot = response?.snapshot || response;
      if (snapshot) sendToQuickSend("capture:quick-send-snapshot", snapshot);
      return snapshot;
    } catch (error) {
      const message = String(error?.message || error || "RoomBoard Quick Send is not ready yet.");
      const snapshot = {
        statusMessage: message,
        statusKind: "error",
        form: {},
        rooms: [],
        colorLabels: [],
        doctors: [{ value: "", label: "No doctor" }],
        quickNotes: [{ value: "", label: "No quick note" }]
      };
      sendToQuickSend("capture:quick-send-snapshot", snapshot);
      return snapshot;
    }
  }

  function resolveQuickSendResponse(response) {
    const requestId = response?.requestId;
    if (!requestId || !pendingQuickSendRequests.has(requestId)) return;
    const pending = pendingQuickSendRequests.get(requestId);
    pendingQuickSendRequests.delete(requestId);
    clearTimeout(pending.timeout);
    if (response.ok === false) {
      pending.reject(new Error(response.error || "RoomBoard Quick Send failed."));
      return;
    }
    pending.resolve(response);
  }

  function registerHotkey() {
    globalShortcut.unregister(captureHotkey);
    if (!enableHotkey) return false;
    const registered = globalShortcut.register(captureHotkey, () => {
      if (isArmed) stopCapture("Capture cancelled.");
      else startHoverCapture({ source: "menu-bar" }).catch((error) => sendStatus(String(error?.message || error || "Capture failed.")));
    });

    if (!registered) {
      sendStatus(`Could not register hotkey ${captureHotkey}.`);
    }
    return registered;
  }

  function registerIpc() {
    if (ipcRegistered) return;
    ipcRegistered = true;
    ipcMain.handle("capture:start", () => startCapture());
    ipcMain.handle("capture:start-hover", () => startHoverCapture());
    ipcMain.handle("capture:stop", () => stopCapture("Capture cancelled."));
    ipcMain.handle("capture:read-clipboard-text", () => clipboard.readText() || "");
    ipcMain.handle("capture:copy-text", (_event, text) => {
      clipboard.writeText(String(text || ""));
      return { ok: true };
    });
    ipcMain.handle("capture:get-last-captured", () => lastCapturedPayload);
    ipcMain.handle("capture:get-status", () => ({
      armed: isArmed,
      helperAvailable: !!getHelperPath(),
      helperPlatform: getHelperInfo().config?.name || process.platform,
      hotkey: enableHotkey ? captureHotkey : "",
      platform: process.platform
    }));
    ipcMain.handle("capture:quick-send-show", async () => {
      openQuickSendSurface(isArmed ? "Capture active." : "Ready.");
      return { ok: true };
    });
    ipcMain.handle("capture:quick-send-ready", async () => {
      return await refreshQuickSendSnapshot();
    });
    ipcMain.handle("capture:quick-send-request", async (_event, request) => {
      const action = String(request?.action || "").trim();
      if (action === "capture") {
        return { ok: false, message: menuBarOnlyCaptureMessage };
      }
      if (action === "stop") {
        const result = stopCapture("Capture cancelled.");
        setTimeout(() => refreshQuickSendSnapshot().catch(() => {}), 50);
        return result;
      }
      if (action === "refresh" || action === "snapshot") {
        return await refreshQuickSendSnapshot();
      }
      if (action === "open-main") {
        await Promise.resolve(openTargetWindow("Ready."));
        return { ok: true };
      }
      const response = await requestQuickSendHost(action, request?.payload || {});
      if (response?.snapshot) sendToQuickSend("capture:quick-send-snapshot", response.snapshot);
      return response;
    });
    ipcMain.on("capture:quick-send-response", (_event, response) => {
      resolveQuickSendResponse(response);
    });
    ipcMain.on("capture:quick-send-snapshot", (_event, snapshot) => {
      sendToQuickSend("capture:quick-send-snapshot", snapshot);
    });
  }

  function destroy() {
    globalShortcut.unregister(captureHotkey);
    stopCapture("Capture stopped.");
    if (tray) {
      tray.destroy();
      tray = null;
    }
    if (reviewWindow && !reviewWindow.isDestroyed()) {
      reviewWindow.destroy();
      reviewWindow = null;
    }
    if (quickSendWindow && !quickSendWindow.isDestroyed()) {
      quickSendWindow.destroy();
      quickSendWindow = null;
    }
    pendingQuickSendRequests.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error("RoomBoard is closing."));
    });
    pendingQuickSendRequests.clear();
  }

  return {
    createReviewWindow,
    createQuickSendWindow,
    createTray,
    destroy,
    getLastCaptured: () => lastCapturedPayload,
    getStatus: () => ({
      armed: isArmed,
      helperAvailable: !!getHelperPath(),
      helperPlatform: getHelperInfo().config?.name || process.platform,
      hotkey: enableHotkey ? captureHotkey : "",
      platform: process.platform
    }),
    registerHotkey,
    registerIpc,
    sendStatus,
    startCapture,
    startHoverCapture,
    stopCapture
  };
}

module.exports = {
  createCaptureService
};
