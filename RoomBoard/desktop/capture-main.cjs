const { app } = require("electron");
const path = require("path");
const { createCaptureService } = require("./capture-service.cjs");

let captureService = null;
let isQuitting = false;

function desktopPath(filename) {
  return path.join(__dirname, filename);
}

function configureMenuBarMode() {
  if (process.platform !== "darwin") return;

  if (typeof app.setActivationPolicy === "function") {
    app.setActivationPolicy("accessory");
  }

  if (app.dock) {
    app.dock.hide();
  }
}

app.on("window-all-closed", () => {
  if (isQuitting && captureService) {
    captureService.stopCapture("Capture stopped.");
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  if (captureService) {
    captureService.destroy();
  }
});

app.on("activate", () => {
  configureMenuBarMode();
});

app.whenReady().then(() => {
  configureMenuBarMode();
  captureService = createCaptureService({
    desktopPath,
    isQuitting: () => isQuitting,
    macTrayActiveTitle: "RoomBoard ON",
    macTrayIdleTitle: "RoomBoard",
    quitApp: () => {
      isQuitting = true;
      app.quit();
    },
    trayToolTip: "RoomBoard Capture",
    useReviewWindow: true
  });
  captureService.registerIpc();
  captureService.createTray();
  captureService.createReviewWindow({ showOnReady: false });
  captureService.registerHotkey();
}).catch((error) => {
  console.error("RoomBoard Capture startup failed:", error);
  app.quit();
});
