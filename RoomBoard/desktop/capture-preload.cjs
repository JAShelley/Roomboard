const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("roomboardCapture", {
  getStatus: () => ipcRenderer.invoke("capture:get-status"),
  start: () => ipcRenderer.invoke("capture:start"),
  startHover: () => ipcRenderer.invoke("capture:start-hover"),
  stop: () => ipcRenderer.invoke("capture:stop"),
  getLastCaptured: () => ipcRenderer.invoke("capture:get-last-captured"),
  readClipboardText: () => ipcRenderer.invoke("capture:read-clipboard-text"),
  copyText: (text) => ipcRenderer.invoke("capture:copy-text", text),
  quickSendReady: () => ipcRenderer.invoke("capture:quick-send-ready"),
  quickSendRequest: (action, payload) => ipcRenderer.invoke("capture:quick-send-request", { action, payload }),
  showQuickSend: () => ipcRenderer.invoke("capture:quick-send-show"),
  publishQuickSendSnapshot: (snapshot) => ipcRenderer.send("capture:quick-send-snapshot", snapshot),
  sendQuickSendResponse: (response) => ipcRenderer.send("capture:quick-send-response", response),
  onCaptured: (callback) => subscribe("capture:captured", callback),
  onHover: (callback) => subscribe("capture:hover", callback),
  onStatus: (callback) => subscribe("capture:status", callback),
  onQuickSendRequest: (callback) => subscribe("capture:quick-send-request", callback),
  onQuickSendSnapshot: (callback) => subscribe("capture:quick-send-snapshot", callback)
});
