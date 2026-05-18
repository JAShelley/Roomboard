const api = globalThis.chrome || globalThis.browser;

const SETTINGS_KEY = "vetboardMiniOverlaySettings";
const DEFAULT_SETTINGS = {
  warningMinutes: 20,
  criticalMinutes: 35,
  autoRefreshMs: 15000,
  panelOpenByDefault: false
};

async function ensureDefaultSettings() {
  const stored = await api.storage.local.get(SETTINGS_KEY);
  if (stored[SETTINGS_KEY]) {
    return;
  }

  await api.storage.local.set({
    [SETTINGS_KEY]: DEFAULT_SETTINGS
  });
}

api.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings().catch(() => {});
});

api.runtime.onStartup?.addListener(() => {
  ensureDefaultSettings().catch(() => {});
});

api.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) {
    return;
  }

  try {
    await api.tabs.sendMessage(tab.id, { type: "vetboard-mini-overlay/toggle-panel" });
  } catch (error) {
    // Content scripts do not run on Chrome internal pages or restricted origins.
    console.debug("VetBoard Mini Overlay toggle failed", error);
  }
});

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "vetboard-mini-overlay/ping") {
    return undefined;
  }

  sendResponse({ ok: true });
  return false;
});
