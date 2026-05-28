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
  stop: () => ipcRenderer.invoke("capture:stop"),
  getLastCaptured: () => ipcRenderer.invoke("capture:get-last-captured"),
  readClipboardText: () => ipcRenderer.invoke("capture:read-clipboard-text"),
  copyText: (text) => ipcRenderer.invoke("capture:copy-text", text),
  onCaptured: (callback) => subscribe("capture:captured", callback),
  onHover: (callback) => subscribe("capture:hover", callback),
  onStatus: (callback) => subscribe("capture:status", callback)
});
