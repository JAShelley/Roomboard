const api = globalThis.chrome || globalThis.browser;

async function updateBadge() {
  const data = await api.storage.local.get("pendingAppointment");
  const hasPending = Boolean(data.pendingAppointment);
  await api.action.setBadgeBackgroundColor({ color: hasPending ? "#0f766e" : "#6b7280" });
  await api.action.setBadgeText({ text: hasPending ? "1" : "" });
}

api.runtime.onInstalled.addListener(() => {
  updateBadge().catch(() => {});
});

api.runtime.onStartup?.addListener(() => {
  updateBadge().catch(() => {});
});

api.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !Object.prototype.hasOwnProperty.call(changes, "pendingAppointment")) {
    return;
  }
  updateBadge().catch(() => {});
});
