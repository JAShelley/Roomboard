const api = globalThis.chrome || globalThis.browser;
const AUTH_STATUS_KEY = "vetboardSupabaseAuthStatus";

async function updateBadge() {
  const data = await api.storage.local.get(["pendingAppointment", AUTH_STATUS_KEY]);
  const hasPending = Boolean(data.pendingAppointment);
  const needsLogin = !!(data[AUTH_STATUS_KEY] && data[AUTH_STATUS_KEY].needsLogin);
  if (needsLogin) {
    await api.action.setBadgeBackgroundColor({ color: "#dc2626" });
    await api.action.setBadgeText({ text: "!" });
    return;
  }
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
  if (
    areaName !== "local" ||
    (!Object.prototype.hasOwnProperty.call(changes, "pendingAppointment")
      && !Object.prototype.hasOwnProperty.call(changes, AUTH_STATUS_KEY))
  ) {
    return;
  }
  updateBadge().catch(() => {});
});
