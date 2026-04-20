const { app, BrowserWindow, shell } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".zip": "application/zip"
};

let mainWindow = null;
let staticServer = null;

function getStaticRoot() {
  return path.resolve(__dirname, "..", "public", "roomboard");
}

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function sendResponse(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, {
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

async function resolveRequestPath(rootDir, requestPath) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.resolve(rootDir, `.${normalizedPath}`);

  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
    throw new Error("FORBIDDEN");
  }

  const stats = await fs.promises.stat(filePath).catch(() => null);
  if (!stats) {
    throw Object.assign(new Error("Not found"), { code: "ENOENT" });
  }

  if (stats.isDirectory()) {
    return path.join(filePath, "index.html");
  }

  return filePath;
}

function createStaticServer(rootDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        const filePath = await resolveRequestPath(rootDir, decodeURIComponent(url.pathname));
        const fileBuffer = await fs.promises.readFile(filePath);

        sendResponse(res, 200, fileBuffer, {
          "Content-Type": getMimeType(filePath)
        });
      } catch (error) {
        if (error && error.message === "FORBIDDEN") {
          sendResponse(res, 403, "Forbidden", {
            "Content-Type": "text/plain; charset=utf-8"
          });
          return;
        }

        if (error && error.code === "ENOENT") {
          sendResponse(res, 404, "Not found", {
            "Content-Type": "text/plain; charset=utf-8"
          });
          return;
        }

        console.error("RoomBoard desktop server error:", error);
        sendResponse(res, 500, "RoomBoard desktop server error", {
          "Content-Type": "text/plain; charset=utf-8"
        });
      }
    });

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Static server failed to bind to a local port."));
        return;
      }

      resolve({
        port: address.port,
        server
      });
    });
  });
}

async function ensureStaticServer() {
  if (staticServer) {
    return staticServer;
  }

  const rootDir = getStaticRoot();
  const entryFile = path.join(rootDir, "index.html");
  await fs.promises.access(entryFile, fs.constants.R_OK);
  staticServer = await createStaticServer(rootDir);
  return staticServer;
}

function closeStaticServer() {
  if (!staticServer || !staticServer.server) {
    return;
  }

  try {
    staticServer.server.close();
  } catch (error) {
    console.warn("RoomBoard desktop server close warning:", error);
  } finally {
    staticServer = null;
  }
}

async function createMainWindow() {
  const { port } = await ensureStaticServer();
  const baseUrl = `http://127.0.0.1:${port}`;

  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    backgroundColor: "#0c151c",
    height: 960,
    minHeight: 720,
    minWidth: 1024,
    show: false,
    title: "RoomBoard",
    width: 1440,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(baseUrl)) {
      return { action: "allow" };
    }

    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(baseUrl)) {
      return;
    }

    event.preventDefault();
    shell.openExternal(url);
  });

  await mainWindow.loadURL(`${baseUrl}/index.html`);
}

app.on("window-all-closed", () => {
  closeStaticServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  closeStaticServer();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.whenReady().then(createMainWindow).catch((error) => {
  console.error("RoomBoard desktop startup failed:", error);
  app.quit();
});
